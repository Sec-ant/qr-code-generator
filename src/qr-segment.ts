import { bit, byte, int, appendBits } from "./utils.js";

/*---- Data segment class ----*/

/*
 * A segment of character/binary/control data in a QR Code symbol.
 * Instances of this class are immutable.
 * The mid-level way to create a segment is to take the payload data
 * and call a static factory function such as QrSegment.makeNumeric().
 * The low-level way to create a segment is to custom-make the bit buffer
 * and call the QrSegment() constructor with appropriate values.
 * This segment class imposes no length restrictions, but QR Codes have restrictions.
 * Even in the most favorable conditions, a QR Code can only hold 7089 characters of data.
 * Any segment longer than this is meaningless for the purpose of generating QR Codes.
 */
export class QrSegment {
  /*-- Static factory functions (mid level) --*/

  // Returns a segment representing the given binary data encoded in
  // byte mode. All input byte arrays are acceptable. Any text string
  // can be converted to UTF-8 bytes and encoded as a byte mode segment.
  public static makeBytes(data: Readonly<byte[]>): QrSegment {
    const bb: bit[] = [];
    for (const b of data) {
      appendBits(b, 8, bb);
    }
    return new QrSegment(Mode.BYTE, data.length, bb);
  }

  // Returns a segment representing the given string of decimal digits encoded in numeric mode.
  public static makeNumeric(digits: string): QrSegment {
    if (!QrSegment.isNumeric(digits)) {
      throw new RangeError("String contains non-numeric characters");
    }
    const bb: bit[] = [];
    for (let i = 0; i < digits.length; ) {
      // Consume up to 3 digits per iteration
      const n: int = Math.min(digits.length - i, 3);
      appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
      i += n;
    }
    return new QrSegment(Mode.NUMERIC, digits.length, bb);
  }

  // Returns a segment representing the given text string encoded in alphanumeric mode.
  // The characters allowed are: 0 to 9, A to Z (uppercase only), space,
  // dollar, percent, asterisk, plus, hyphen, period, slash, colon.
  public static makeAlphanumeric(text: string): QrSegment {
    if (!QrSegment.isAlphanumeric(text)) {
      throw new RangeError(
        "String contains unencodable characters in alphanumeric mode"
      );
    }
    const bb: bit[] = [];
    let i: int;
    for (i = 0; i + 2 <= text.length; i += 2) {
      // Process groups of 2
      let temp: int =
        QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
      temp += QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
      appendBits(temp, 11, bb);
    }
    if (i < text.length) {
      // 1 character remaining
      appendBits(QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
    }
    return new QrSegment(Mode.ALPHANUMERIC, text.length, bb);
  }

  // Returns a new mutable list of zero or more segments to represent the given Unicode text string.
  // The result may use various segment modes and switch modes to optimize the length of the bit stream.
  public static makeSegments(text: string): QrSegment[] {
    // Select the most efficient segment encoding automatically
    if (text == "") {
      return [];
    } else if (QrSegment.isNumeric(text)) {
      return [QrSegment.makeNumeric(text)];
    } else if (QrSegment.isAlphanumeric(text)) {
      return [QrSegment.makeAlphanumeric(text)];
    } else {
      return [QrSegment.makeBytes(QrSegment.toUtf8ByteArray(text))];
    }
  }

  // Returns a segment representing an Extended Channel Interpretation
  // (ECI) designator with the given assignment value.
  public static makeEci(assignVal: int): QrSegment {
    const bb: bit[] = [];
    if (assignVal < 0) {
      throw new RangeError("ECI assignment value out of range");
    } else if (assignVal < 1 << 7) {
      appendBits(assignVal, 8, bb);
    } else if (assignVal < 1 << 14) {
      appendBits(0b10, 2, bb);
      appendBits(assignVal, 14, bb);
    } else if (assignVal < 1000000) {
      appendBits(0b110, 3, bb);
      appendBits(assignVal, 21, bb);
    } else {
      throw new RangeError("ECI assignment value out of range");
    }
    return new QrSegment(Mode.ECI, 0, bb);
  }

  // Tests whether the given string can be encoded as a segment in numeric mode.
  // A string is encodable iff each character is in the range 0 to 9.
  public static isNumeric(text: string): boolean {
    return QrSegment.NUMERIC_REGEX.test(text);
  }

  // Tests whether the given string can be encoded as a segment in alphanumeric mode.
  // A string is encodable iff each character is in the following set: 0 to 9, A to Z
  // (uppercase only), space, dollar, percent, asterisk, plus, hyphen, period, slash, colon.
  public static isAlphanumeric(text: string): boolean {
    return QrSegment.ALPHANUMERIC_REGEX.test(text);
  }

  /*-- Constructor (low level) and fields --*/

  // Creates a new QR Code segment with the given attributes and data.
  // The character count (numChars) must agree with the mode and the bit buffer length,
  // but the constraint isn't checked. The given bit buffer is cloned and stored.
  public constructor(
    // The mode indicator of this segment.
    public readonly mode: Mode,

    // The length of this segment's unencoded data. Measured in characters for
    // numeric/alphanumeric/kanji mode, bytes for byte mode, and 0 for ECI mode.
    // Always zero or positive. Not the same as the data's bit length.
    public readonly numChars: int,

    // The data bits of this segment. Accessed through getData().
    private readonly bitData: bit[]
  ) {
    if (numChars < 0) {
      throw new RangeError("Invalid argument");
    }
    this.bitData = bitData.slice(); // Make defensive copy
  }

  /*-- Methods --*/

  // Returns a new copy of the data bits of this segment.
  public getData(): bit[] {
    return this.bitData.slice(); // Make defensive copy
  }

  // (Package-private) Calculates and returns the number of bits needed to encode the given segments at
  // the given version. The result is infinity if a segment has too many characters to fit its length field.
  public static getTotalBits(
    segs: Readonly<QrSegment[]>,
    version: int
  ): number {
    let result = 0;
    for (const seg of segs) {
      const ccbits: int = seg.mode.numCharCountBits(version);
      if (seg.numChars >= 1 << ccbits) {
        return Infinity;
      } // The segment's length doesn't fit the field's bit width
      result += 4 + ccbits + seg.bitData.length;
    }
    return result;
  }

  // Returns a new array of bytes representing the given string encoded in UTF-8.
  private static toUtf8ByteArray(str: string): byte[] {
    str = encodeURI(str);
    const result: byte[] = [];
    for (let i = 0; i < str.length; i++) {
      if (str.charAt(i) != "%") {
        result.push(str.charCodeAt(i));
      } else {
        result.push(parseInt(str.substring(i + 1, i + 3), 16));
        i += 2;
      }
    }
    return result;
  }

  /*-- Constants --*/

  // Describes precisely all strings that are encodable in numeric mode.
  private static readonly NUMERIC_REGEX: RegExp = /^[0-9]*$/;

  // Describes precisely all strings that are encodable in alphanumeric mode.
  private static readonly ALPHANUMERIC_REGEX: RegExp = /^[A-Z0-9 $%*+./:-]*$/;

  // The set of all legal characters in alphanumeric mode,
  // where each character value maps to the index in the string.
  private static readonly ALPHANUMERIC_CHARSET: string =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
}

/*
 * Describes how a segment's data bits are interpreted. Immutable.
 */
export class Mode {
  /*-- Constants --*/

  public static readonly NUMERIC = new Mode(0x1, [10, 12, 14]);
  public static readonly ALPHANUMERIC = new Mode(0x2, [9, 11, 13]);
  public static readonly BYTE = new Mode(0x4, [8, 16, 16]);
  public static readonly KANJI = new Mode(0x8, [8, 10, 12]);
  public static readonly ECI = new Mode(0x7, [0, 0, 0]);

  /*-- Constructor and fields --*/

  private constructor(
    // The mode indicator bits, which is a uint4 value (range 0 to 15).
    public readonly modeBits: int,
    // Number of character count bits for three different version ranges.
    private readonly numBitsCharCount: [int, int, int]
  ) {}

  /*-- Method --*/

  // (Package-private) Returns the bit width of the character count field for a segment in
  // this mode in a QR Code at the given version number. The result is in the range [0, 16].
  public numCharCountBits(ver: int): int {
    return this.numBitsCharCount[Math.floor((ver + 7) / 17)];
  }
}
