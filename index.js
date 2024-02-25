/**
 * @param {string | bigint | number | {dp: number, v: BigInt}} val
 * @return {BigDec}
 * @constructor
 */
function BigDec(val) {
    if (val instanceof BigDec) return val;
    if (!this || this.constructor !== BigDec) return new BigDec(val);
    if (typeof val === "number" || typeof val === "bigint") val = val.toString();
    if (typeof val === "string") {
        val = val.replaceAll(" ", "");
        if (!val || val === "0") return ZERO;
        if (val[0] === "+") val = val.substring(1);
        if (!/^-?\d*(\.\d*)?$/.test(val)) throw new Error("Invalid number notation: '" + val + "'");

        const sign = val[0] === "-" ? -1 : 1;
        if (sign === -1) val = val.substring(1);

        let decimalPoint = val.indexOf(".");
        if (decimalPoint === -1) decimalPoint = val.length;

        val = val.substring(0, decimalPoint) + val.substring(decimalPoint + 1);

        this.dp = val.length - decimalPoint;
        /*** @type {bigint} */
        this.v = BigInt(sign * val);
    } else {
        Object.assign(this, val);
    }
    if (this.dp > BigDec.FLOAT_PRECISION) {
        const diff = this.dp - BigDec.FLOAT_PRECISION;
        this.v = BigInt(this.v.toString().slice(0, -diff));
        this.dp = BigDec.FLOAT_PRECISION;
    }
}

BigDec.FLOAT_PRECISION = 20;
const ZERO = new BigDec({dp: 0, v: 0n});

BigDec.prototype._simplifyPrecision = function () {
    while (this.dp > 0 && this.v % 10n === 0n) {
        this.dp--;
        this.v /= 10n;
    }
    return this;
};

BigDec.prototype.isZero = function () {
    return this.v === 0n;
};

BigDec.prototype.clone = function () {
    return BigDec({dp: this.dp, v: this.v});
};

BigDec.prototype.negate = function () {
    return new BigDec({dp: this.dp, v: -this.v});
};

BigDec.prototype.digitCount = function () {
    return this.v.toString().length;
};

BigDec.prototype.posDigitCount = function () {
    return this.digitCount() - this.dp;
};

BigDec.prototype.eq = function (dec) {
    dec = BigDec(dec);
    return this.v === dec.v
        && this.dp === dec.dp;
};

BigDec.prototype.sign = function () {
    return this.v > 0n ? 1 : (this.v === 0n ? 0 : -1);
};

// 2  <=> invalid.
// 1  <=> this > dec
// 0  <=> this = dec
// -1 <=> this < dec
BigDec.prototype.cmp = function (dec) {
    dec = BigDec(dec);

    if (this.eq(dec)) return 0;

    const signT = this.sign();
    const signD = dec.sign();
    if (signT !== signD) return signT > signD ? 1 : -1;

    const thD = this.posDigitCount();
    const deD = dec.posDigitCount();
    if (thD !== deD) return thD > deD ? 1 : -1;

    return this.v > dec.v ? 1 : -1;
};

BigDec.prototype.gt = function (dec) {
    return this.cmp(dec) === 1;
};

BigDec.prototype.lt = function (dec) {
    return this.cmp(dec) === -1;
};

BigDec.prototype.shiftLeft = function (amount = 1) {
    return new BigDec({dp: this.dp + amount, v: BigInt(this.v.toString() + "0".repeat(amount))});
};

BigDec.prototype.abs = function () {
    return new BigDec({dp: this.dp, sign: 1, v: this.v})
};

BigDec.prototype.add = function (b) {
    let a = this;
    b = BigDec(b);

    if (a.dp !== b.dp) {
        const len = Math.abs(a.dp - b.dp);
        if (a.dp > b.dp) b = b.shiftLeft(len);
        if (b.dp > a.dp) a = a.shiftLeft(len);
    }

    return new BigDec({dp: a.dp, v: a.v + b.v});
};

BigDec.prototype.sub = function (dec) {
    dec = BigDec(dec);
    return this.add(dec.negate());
};

BigDec.prototype.mul = function (dec) {
    dec = BigDec(dec);
    return new BigDec({dp: this.dp + dec.dp, v: this.v * dec.v});
};

BigDec.prototype.inverse = function () {
    if (this.isZero()) throw new Error("Can't divide by zero.");
    let vStr = this.v.toString();
    if (/^-?10*$/.test(vStr)) {
        vStr = vStr.replace("-", "");
        const dp = vStr.length - 1 - this.dp; // -1 is for the extra "1" at the beginning of the number
        if (dp > 0) return new BigDec({dp, v: 1n});
        return new BigDec({dp: 0, v: BigInt((this.v > 0n ? "" : "-") + "1" + "0".repeat(-dp))});
    }
    let result = "";
    const count = this.digitCount();
    let n = BigInt("1" + "0".repeat(count));
    const vUse = this.v > 0n ? this.v : -this.v;
    for (let i = 0; i < BigDec.FLOAT_PRECISION; i++) {
        const mod = n % vUse;
        result += n / vUse;
        if (mod === 0n) break;
        n = mod * 10n;
    }
    return new BigDec({dp: count + result.length - 1 - this.dp, v: BigInt((this.v > 0n ? "" : "-") + result)});
};

/**
 * @param dec
 * @return {BigDec}
 */
BigDec.prototype.div = function (dec) {
    dec = BigDec(dec);
    return this.mul(dec.inverse())._simplifyPrecision();
};

BigDec.prototype.square = function () {
    return this.mul(this);
};

BigDec.prototype.cube = function () {
    return this.mul(this.mul(this));
};

BigDec.prototype.sqrt = function () {
    if (this.v < 0) throw new Error("Can't take the square root of a negative number in the real world.");
    if (this.v === 0n || this.v === 1n) return this;
    let x = this.div(2);
    for (let i = 0; i < 100000; i++) {
        const a = this.div(x);
        const b = x.add(a);
        const c = b.div(2);
        const dx = c.sub(x);
        if (dx.isZero()) return x;
        x = c;
    }
    console.warn("not enough precision");
    return x;
};

BigDec.prototype.toString = function () {
    if (this.isZero()) return "0";
    let str = this.v.toString();
    if (str[0] === "-") str = str.substring(1);
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
    const sign = this.v >= 0 ? "" : "-";
    return sign + str;
};

BigDec.prototype.toFixed = function (dp) {
    // todo
};

/**
 * @param {string | bigint | number | {dp: number, v: BigInt} | BigDec} re
 * @param {string | bigint | number | {dp: number, v: BigInt} | BigDec} im
 * @constructor
 */
function BigNum(re = "0", im = "0") {
    if (re instanceof BigNum) return re;
    if (!this || this.constructor !== BigNum) return new BigNum(re, im);

    if (typeof re === "string" && /^[+-]?\d*(\.\d*)?[+-](i\d*(\.\d*)?|\d*(\.\d*)?i|i)$/.test(re.replaceAll(" ", ""))) {
        re = re.replaceAll(" ", "");
        const spl = re.split(/([+-])/);
        re = spl[0];
        im = spl[1] + (spl[2].replace("i", "") || "1");
    }

    this.re = BigDec(re);
    this.im = BigDec(im);
}

BigNum.prototype.clone = function () {
    return new BigNum(this.re.clone(), this.im.clone());
};

BigNum.prototype.negate = function () {
    return new BigNum(this.re.negate(), this.im.negate());
};

BigNum.prototype.add = function (num) {
    num = BigNum(num);
    return new BigNum(this.re.add(num.re), this.im.add(num.im));
};

// noinspection JSValidateTypes,JSDeprecatedSymbols
BigNum.prototype.sub = function (num) {
    num = BigNum(num);
    return new BigNum(this.re.sub(num.re), this.im.sub(num.im));
};

BigNum.prototype.mul = function (num) {
    num = BigNum(num);
    // (a + bi) / (c + di) = (ac - bd) + i(ad + bc)
    return new BigNum(
        this.re.mul(num.re).sub(this.im.mul(num.im)),
        this.re.mul(num.im).add(this.im.mul(num.re))
    );
};

BigNum.prototype.inverse = function () {
    // 1 / (a + bi) = (a - bi) / (a^2 + b^2)
    const bottom = this.re.square().add(this.im.square());
    return new BigNum(
        this.re.div(bottom),
        this.im.div(bottom).negate()
    );
};

BigNum.prototype.div = function (num) {
    num = BigNum(num);
    return this.mul(num.inverse());
};

BigNum.prototype.isZero = function () {
    return this.re.isZero() && this.im.isZero();
};

BigNum.prototype.sqrt = function () {
};

BigNum.prototype.abs = function () {
    if (this.re.isZero()) return this;
    if (this.im.isZero()) return new BigNum(this.im);
    return this.re.square().add(this.im.square()).sqrt();
};

BigNum.prototype.toString = function () {
    const isReZero = this.re.isZero();
    const isImZero = this.im.isZero();
    if (isReZero && isImZero) return "0";
    let r = "";
    if (!isReZero) {
        r = this.re.toString();
    }
    if (!isImZero) {
        let str = this.im.toString();
        r += this.im.sign() === 1 ? " + " + str + "i" : " - " + str.substring(1) + "i";
    }
    return r;
};