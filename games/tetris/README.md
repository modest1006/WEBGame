# NEON TETRIS

ネオンアーケード風のブラウザテトリス。SRS回転（壁蹴り対応）、7-bag乱数、ホールド、ゴースト、B2B・コンボスコアリング実装。

## 起動

**`index.html` をダブルクリックするだけで遊べます**（`file://` 直開き対応）。

ローカルサーバー経由でも可:

```
python -m http.server 8123 --directory games/tetris
```

→ http://localhost:8123/ （`.claude/launch.json` の `tetris` 設定でも起動可）

## 操作

### キーボード（PC）
| キー | 操作 |
|---|---|
| ← / → | 移動（長押しでDAS/ARRリピート） |
| ↓ | ソフトドロップ |
| Space | ハードドロップ |
| ↑ / X | 右回転 |
| Z / Ctrl | 左回転 |
| C / Shift | ホールド |
| P / Esc | ポーズ |
| R | リスタート |
| M | ミュート |
| ` | デバッグオーバーレイ |

### タッチ（スマホ）
- 画面下のボタン: ◀▼▶ 移動・ソフトドロップ、⟲⟳ 回転、⤓ ハードドロップ、H ホールド
- 盤面ジェスチャー: 横ドラッグ=移動 / タップ=回転 / 下フリック=ハードドロップ / ゆっくり下ドラッグ=ソフトドロップ

## URLパラメータ

- `?debug=1` — デバッグオーバーレイ表示（FPS・内部状態）
- `?seed=123` — 乱数シード固定（再現テスト用）

## デバッグAPI（`window.__game`）

セルフレビュー・自動検証用。決定論的にテストする場合は `pause()` してから `step(ms)` で進める。

| API | 説明 |
|---|---|
| `getState()` | スコア・盤面等のスナップショット |
| `dump()` | 盤面ASCIIダンプ（小文字=操作中ピース、`----`より上はスポーン領域） |
| `step(ms)` | 時間をms分進める（ポーズ中でも可） |
| `start() / pause() / resume()` | 状態遷移 |
| `move(dx) / rotate(dir) / hardDrop() / hold() / softDrop(on)` | 操作 |
| `setRow(y, 'ZZZZ.ZZZZZ')` | 行を文字列でセット（`.`=空） |
| `fillBottomRows(n, holeCol)` | 下からn行を1列穴あきで埋める |
| `clearBoard()` | 盤面クリア |
| `setCurrent(type)` | 操作中ピースを差し替え（'I','O','T','S','Z','J','L'） |
| `setLevel(n)` / `setQueue([...])` | レベル・ネクスト注入 |

検証例（4ライン消し＝TETRISの確認）:

```js
__game.pause();
__game.clearBoard();
__game.fillBottomRows(4, 0);   // 左端1列だけ空けて4行埋める
__game.setCurrent('I');
__game.rotate(1);              // I縦向き
__game.move(-4);               // 左端へ
__game.hardDrop();
__game.step(400);              // 消去アニメーション消化
__game.getState();             // lines: 4, score確認
```
