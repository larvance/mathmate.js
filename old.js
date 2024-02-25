const INT_DIGITS = 1;
const BIGINT_DIGITS = BigInt(INT_DIGITS);
const MAX_INT = 10n ** BIGINT_DIGITS - 1n;
const MAX_INT_BASE = 10n ** (BIGINT_DIGITS - 1n);

/**
 * @param {string | bigint | number | {dp: number, sign: 1 | -1, v: Array}} val
 * @return {Dec}
 * @constructor
 */
function Dec(val) {
    if (val instanceof Dec) return val;
    if (!this || this.constructor !== Dec) return new Dec(val);
    if (typeof val === "number" || typeof val === "bigint") val = val.toString();
    if (typeof val === "string") {
        if (!val || val === "0") return ZERO;
        if (val[0] === "+") val = val.substring(1);
        if (!/^-?\d*(\.\d*)?$/.test(val)) throw new Error("Invalid number notation: '" + val + "'");

        const sign = val[0] === "-" ? -1 : 1;
        if (sign === -1) val = val.substring(1);

        let decimalPoint = val.indexOf(".");
        if (decimalPoint === -1) decimalPoint = val.length;

        val = val.substring(0, decimalPoint) + val.substring(decimalPoint + 1);

        const vLen = Math.ceil(val.length / INT_DIGITS);
        const v = [];

        for (let i = val.length - INT_DIGITS, j = vLen - 1; i > -INT_DIGITS; i -= INT_DIGITS, j--) {
            v[j] = BigInt(val.substring(i, i + INT_DIGITS));
        }

        if (v.length > 1 && !v[0]) v.shift();

        this.dp = val.length - decimalPoint;
        this.sign = sign;
        this.v = v;
    } else {
        Object.assign(this, val);
        this._collectGarbage();
    }
}

Dec.prototype.isZero = function () {
    for (let i = 0; i < this.v.length; i++) {
        if (this.v[i] > 0) return false;
    }
    return true;
};

Dec.prototype.toString = function () {
    if (this.isZero()) return "0";
    let str = "";
    for (let i = 0; i < this.v.length; i++) {
        str += this.v[i].toString().padStart(INT_DIGITS, "0");
    }
    if (str.length < this.dp) {
        str = "0".repeat(this.dp - str.length) + str;
    }
    if (this.dp > 0) {
        const pnt = str.length - this.dp;
        str = str.substring(0, pnt) + "." + str.substring(pnt);
        while (str.endsWith("0")) str = str.substring(0, str.length - 1);
    }
    while (str.startsWith("0")) str = str.substring(1);
    if (str.startsWith(".")) str = "0" + str;
    const sign = this.sign === 1 ? "" : "-";
    return sign + str;
};

Dec.prototype.clone = function () {
    return Dec({dp: this.dp, sign: this.sign, v: Array.from(this.v)});
};

Dec.prototype.negate = function () {
    const x = this.clone();
    x.sign *= -1;
    return x;
};

Dec.prototype.digitCount = function () {
    return this.v.reduce((a, b) => a + b.toString().length, 0);
};

Dec.prototype.posDigitCount = function () {
    return this.digitCount() - this.dp;
};

Dec.prototype.eq = function (dec) {
    dec = Dec(dec);
    return dec.v.length === this.v.length
        && dec.dp === this.dp
        && dec.v.every((v, k) => v === this.v[k]);
};

// 1  <=> this > dec
// 0  <=> this = dec
// -1 <=> this < dec
Dec.prototype.cmp = function (dec) {
    dec = Dec(dec);

    if (this.eq(dec)) return 0;

    if (this.sign !== dec.sign) return this.sign > dec.sign ? 1 : -1;

    const thD = this.posDigitCount();
    const deD = dec.posDigitCount();
    if (thD !== deD) return thD > deD ? 1 : -1;


    // todo
};

Dec.prototype.gt = function (dec) {
    return this.cmp(dec) === 1;
};

Dec.prototype.lt = function (dec) {
    return this.cmp(dec) === -1;
};

Dec.prototype._collectGarbage = function () {
    for (; ;) {
        if (this.v.length === 1) break;
        const t = this.v[0];
        if (t && t > 0n) break;
        this.v.shift();
    }
};

Dec.prototype._shiftLeft = function () {
    // [43, 123, 456]  = 3123456
    // [431, 234, 560] = 31234560
    const more = this.v[0] >= MAX_INT_BASE;
    const vl = this.v.length;
    const v = [];
    v[vl - 1] = BigInt(this.v[vl - 1].toString().substring(1) + "0");
    const mx = more ? 0 : 1;
    for (let i = vl - 1 - 1; i >= mx; i--) {
        v[i] = BigInt(this.v[i].toString().substring(1) + this.v[i + 1].toString()[0]);
    }
    if (more) {
        v.unshift(BigInt(this.v[0].toString()[0]));
    } else v[0] = BigInt(this.v[0].toString() + (this.v[1] || "0").toString()[0]);
    this.v = v;
};

Dec._overflowDigit = function (v, i) {
    const n = v[i];
    if (n > MAX_INT) {
        if (i === 0) v.unshift(1n);
        else {
            v[i - 1] += 1n;
            this._overflowDigit(v, i - 1);
        }
        v[i] -= MAX_INT + 1n;
        this._overflowDigit(v, i);
    } else if (n < 0) {
        // => [1, 0, -3]
        // => [1, -1, 7]
        // => [0, 9, 7]
        if (v.slice(0, i).every(i => i === 0n)) {
            v[i] *= -1n;
            return -1;
        } else {
            v[i - 1] -= 1n;
            v[i] += MAX_INT + 1n;
            this._overflowDigit(v, i - 1);
            this._overflowDigit(v, i);
        }
    }
    return 1;
};

Dec.prototype.abs = function () {
    return new Dec({dp: this.dp, sign: 1, v: Array.from(this.v)})
};

Dec.prototype.add = function (b) {
    let a = this;
    b = Dec(b);

    const opSign = BigInt(a.sign * b.sign);

    if (opSign === -1n && a.abs().lt(b)) {
        const t = a;
        a = b;
        b = t;
    }

    if (a.dp !== b.dp) {
        // adds zeroes at the end to make the size fixed
        // a = 124124.124198
        // b = 124142.210000
        if (a.dp > b.dp) b = b.clone();
        if (b.dp > a.dp) a = a.clone();
        const c = a.dp > b.dp ? b : a;
        const len = Math.abs(a.dp - b.dp);
        for (let i = 0; i < len; i++) c._shiftLeft();
    }

    let sign = a.sign;

    const vLen = Math.max(a.v.length, b.v.length) + 1;
    const v = new Array(vLen).fill(0n);

    for (let i = 0; i < vLen - 1; i++) {
        v[vLen - i] = (a.v[a.v.length - i - 1] ?? 0n) + opSign * (b.v[b.v.length - i - 1] ?? 0n);
    }

    for (let i = 0; i < vLen - 1; i++) {
        sign *= Dec._overflowDigit(v, vLen - i);
    }

    return Dec({dp: a.dp, sign, v});
};

Dec.prototype.sub = function (dec) {
    dec = Dec(dec);
    return this.add(dec.negate());
};

Dec.prototype.mul = function (dec) {

};

/**
 * @param {string | bigint | number | {dp: number, sign: 1 | -1, v: Array} | Dec} re
 * @param {string | bigint | number | {dp: number, sign: 1 | -1, v: Array} | Dec} im
 * @constructor
 */
function Num(re = "0", im = "0") {
    if (re instanceof Num) return re;
    if (!this || this.constructor !== Num) return new Num(re, im);

    this.re = Dec(re);
    this.im = Dec(im);
}

Num.prototype.clone = function () {
    return new Num(this.re.clone(), this.im.clone());
};

Num.prototype.negate = function () {
    return new Num(this.re.negate(), this.im.negate());
};

Num.prototype.add = function (num) {
    num = Num(num);
    return new Num(this.re.add(num.re), this.im.add(num.im));
};

// noinspection JSValidateTypes,JSDeprecatedSymbols
Num.prototype.sub = function (num) {
    num = Num(num);
    return new Num(this.re.sub(num.re), this.im.sub(num.im));
};

Num.prototype.toString = function () {
    const isReZero = this.re.isZero();
    const isImZero = this.im.isZero();
    if (isReZero && isImZero) return "0";
    let r = "";
    if (!isReZero) {
        r = this.re.toString();
    }
    if (!isImZero) {
        let str = this.im.toString();
        r += this.im.sign === 1 ? " + " + str + "i" : " - " + str.substring(1) + "i";
    }
    return r;
};

const ZERO = Dec({dp: 0, sign: 1, v: [0]});

console.log(
    Dec(3).sub(10)
);