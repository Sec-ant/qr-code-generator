# @sec-ant/qr-code-generator

A QR Code generator in Typescript. This package is ported from [nayuki/QR-Code-generator](https://github.com/nayuki/QR-Code-generator). Typescript namespaces are discarded.

## Install

```ts
npm i @sec-ant/qr-code-generator
```

## Usage

```ts
import { QrCode, Ecc } from "@sec-ant/qr-code-generator";

const qrCode = QrCode.encodeText("Hello, world!", Ecc.MEDIUM);
```

## License

MIT
