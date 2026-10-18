# node-red-contrib-mcu-display

[Node-RED MCU Edition](https://github.com/phoddie/node-red-mcu) 用の OLED ディスプレイノードです。
**I2C** で接続した **SSD1306** / **SSD1315** の OLED ディスプレイに、フローから文字や記号を表示します。
SSD1306 のモジュールはおもに 0.96 インチ 128 x 64 と 0.91 インチ 128 x 32、SSD1315 のモジュールはおもに 0.96 インチ 128 x 64 です。

English: [README.md](../../README.md)

状況：Moddable のシミュレータで模擬ディスプレイを使ってテストし、Moddable SDK 7.2.1 / ESP-IDF 5.5.1 で ESP32 / XIAO ESP32S3 / XIAO ESP32C3 向けのビルドを確認しています。実機ではまだ確認していません。

## インストール

```sh
cd ~/.node-red
npm install @background404/node-red-contrib-mcu-display
```

## OLED モジュール

OLED モジュールの例（Amazon）：

- https://link.amazon/B02OXPvgX
- https://link.amazon/B0brU5Ri3

## 配線

| ディスプレイ | ボード |
|---|---|
| VCC | 3.3 V |
| GND | GND |
| SDA | SDA ピン（ボードの既定の I2C の SDA、または設定ノードで指定したピン） |
| SCL | SCL ピン |

ほとんどのモジュールの I2C アドレスは `0x3C` です（アドレスのジャンパを変えたものは `0x3D`。裏面の `0x78` / `0x7A` は同じアドレスを 1 ビット左にずらした表記です）。

## ノード

- **display config**（`mcu-display-config`）- ディスプレイの設定：コントローラ（SSD1306 / SSD1315）、サイズ（128 x 64 / 128 x 32）、I2C アドレス、SDA / SCL ピン（空ならボードの既定）、I2C 速度、180°回転
- **display**（`mcu-display`）- `msg.payload` を指定の行・文字サイズ（1～4）・配置で表示し、メッセージを次に渡します

### display の入力

| `msg.payload` | 結果 |
|---|---|
| `"Hello"`、`23.5` | ノードの行・サイズ・配置で表示。`\n`（改行文字、または inject ノードで入力した 2 文字）で改行し、長い行は折り返します（*長い行* でスクロール・切り捨ても選べます） |
| `{ "text": "23.5°C", "line": 3, "size": 2, "align": "right" }` | 1 つの項目。プロパティがノードの設定より優先されます（`x`・`y`（ピクセル）、`invert`、`clear`、`wrap` も指定可） |
| `["Temp", { "text": "23.5°C", "size": 2 }]` | 項目を順番に表示。`line` / `y` のない項目は前の項目の下に続きます |
| `1760000000000`（inject の *タイムスタンプ*）、`Date` | 表示形式 *時刻（HH:MM:SS）* で `09:05:07`。ほかに *時刻（HH:MM）*、*日付（YYYY-MM-DD）*、*日付と時刻*。*文字列* のときは `Date` とタイムスタンプ（2000～2099 年）を日付と時刻で表示。Node-RED MCU では inject ノードを JavaScript の Date オブジェクトに設定してもミリ秒で届きます |
| `"Node-RED MCU on XIAO ESP32C3: ..."`（*長い行* を *横にスクロール* に設定） | 画面に入りきらない行を、次のメッセージまで右から左へスクロール（1 項目だけなら `{ "text": "...", "overflow": "scroll" }`）。*折り返して上にスクロール*（`"scrollup"`）は、折り返した文がノードの行から画面の下端までに入りきらないとき上へスクロール |
| `{ "clear": true }` | 画面を消去 |
| `{ "contrast": 128 }`、`{ "power": false }` | 明るさ（0～255）、表示のオフ / オン |

- 時刻はデバイスのローカル時刻です。時計は Wi-Fi（SNTP）または xsbug でのデバッグ時に合わせられ、どちらもないときは 1970-01-01 から始まります。
- 1 行は 8 ピクセルで、128 x 64 は 1～8 行、128 x 32 は 1～4 行です。1 文字は 6 x 8 ピクセルに文字サイズを掛けた大きさです（サイズ 1 で 1 行 21 文字）。
- **描画の前に**：既定の *文字を書く行を消す* は文字を書く行だけを消すので、1 つの画面の別々の行を複数の display ノードで更新できます。ほかに *画面全体を消す*、*消さずに重ねる* を選べます。
- 表示できる文字：半角英数字・記号（ASCII）と `° ± × ÷ µ ¥ ← → ↑ ↓ ● ○ ■ □ ▲ ▼ ♥ ★ ♪ ✓ … █`。それ以外（日本語など）は `?` で表示し、警告を出します。
- アドレスが違えば複数のディスプレイを同時に使えます（それぞれに設定ノードを 1 つずつ）。

## サンプル

`examples/display.json`（読み込み > サンプル > @background404/node-red-contrib-mcu-display）：サイズ 2 のタイトル、1 秒ごとに更新するカウンタ、時計（inject のタイムスタンプを HH:MM:SS で表示）、記号、スクロールする長い文、サイズを混ぜた温度表示、白黒反転、画面の消去。

## しくみ

- `native/screen.js`（`display/screen`）- コントローラの表示 RAM と同じページ配置の 1 ビットのフレームバッファ、`native/font.js`（`display/font`）の 5 x 7 フォントによる文字の描画、変更されたページの記録
- `native/ssd1306.js`（`display/ssd1306`）- ボードの ECMA-419 I2C（`device.I2C.default`）でパネルを初期化し、変更されたページだけを送ります。SSD1315 も同じコマンドで動きます
- 設定ノードがパネルとフレームバッファを持ち、display ノードはそれを通して描画します

## 開発

- `npm test` - フォント・フレームバッファ・ドライバが送る I2C コマンドを Node.js でテスト
- `test/moddable` - Node-RED を使わない Moddable SDK のプロジェクト：`cd test/moddable && mcconfig -d -m -p esp32`

## ライセンス

MIT（`LICENSE` を参照）。フォントの ASCII 文字は SparkFun の Nokia 5110 のサンプルのものです（MIT License、Copyright (c) 2016 SparkFun Electronics。`THIRD_PARTY_NOTICES.md` を参照）。

ノードは [Node-RED MCU Edition](https://github.com/phoddie/node-red-mcu) と [Moddable SDK](https://github.com/Moddable-OpenSource/moddable) の上で動きます。これらはこのパッケージに含まれず、これらでビルドしたファームウェアにはそれぞれのライセンスも適用されます。
