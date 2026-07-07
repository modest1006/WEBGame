# コロコロ迷路 ROLL MAZE

宙に浮かぶ木製ボードを傾けて、ボールをゴールまで転がす3Dタイムアタックです。穴や奈落に落ちると、スタートまたは最後に通過したチェックポイントへ戻ります。

## 起動

- `games/rollmaze/index.html` をブラウザで直接開けます。
- ローカルサーバーで確認する場合:

```bash
python -m http.server 8129 --directory games/rollmaze
```

## 操作

- マウス / タッチドラッグ: 盤面を傾ける
- 矢印キー / WASD: 盤面を傾ける
- `R`: リスタート
- `M`: ミュート
- `Esc` / `P`: ポーズ
- `` ` ``: デバッグ表示

## ステージ

1. Tutorial Bend: 直線とカーブ
2. First Drop: 最初の穴
3. Forked Lanes: 分岐と行き止まり
4. Arrow Run: 加速パッド
5. Glass Ice: 氷床
6. Clockwork Bar: 回転バー
7. Sky Bridge: 狭い橋と奈落
8. Long Voyage: 総合ステージ、チェックポイントあり

各ステージにはパータイムがあります。パー以内で星3、パーの1.5倍以内で星2、クリアで星1です。ベストタイムと星は `localStorage` に保存されます。

## デバッグAPI

`window.__game`:

- `getState()`: ステージ、ボール位置速度、傾き、時間、落下数、記録を返す
- `dump()`: 盤面とボール位置をASCIIで返す
- `step(ms)`: 決定論ロジックを指定ミリ秒進める
- `tilt(x, z)`: 傾きターゲットを注入する
- `setBall(x, z)`: ボールを配置する
- `setStage(n)`: ステージを切り替える
- `win()`: 強制クリア
- `fall()`: 強制落下
- `stars()`: 保存済み記録を返す

URLパラメータ:

- `?debug=1`: デバッグオーバーレイを表示
- `?seed=N`: 演出用乱数シード

ヘッドレス検証用に `window.__renderOnce(dt)` もあります。1フレーム描画し、`canvas.toDataURL()` の長さを返します。
