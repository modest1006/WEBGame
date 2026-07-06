# COSMIC MERGE

スイカゲーム風の物理マージパズルです。上から天体を落とし、同じ tier の天体が触れると次の天体へ進化します。容器上端のデッドライン上に天体が約 2 秒残るとゲームオーバーです。

## 起動

- `games/cosmicmerge/index.html` をダブルクリックして `file://` で起動できます。
- ローカルサーバーで確認する場合:

```powershell
python -m http.server 8126 --directory games/cosmicmerge
```

その後 `http://localhost:8126/` を開きます。

## 操作

- マウス移動: 照準移動
- クリック: 落下
- 左右キー / A / D: 照準移動
- Space / Enter: 落下
- タッチ: ドラッグで照準、指を離して落下
- R: リスタート
- M: ミュート
- `: デバッグ表示

## スコア

マージ時に `(tier + 1)^2 * 10` を基準点として加算します。同じドロップから連続マージするとコンボ倍率が上がります。ブラックホール同士がマージすると盤面を全消去し、ビッグバンボーナスが入ります。

進化チェーン:

0 星屑 → 1 隕石 → 2 小惑星 → 3 彗星 → 4 月 → 5 火星型惑星 → 6 地球型惑星 → 7 ガス惑星・環つき → 8 太陽 → 9 赤色巨星 → 10 ブラックホール

ドロップで出るのは tier 0 から 4 です。

## デバッグ API

`window.__game` に以下を公開しています。

- `getState()` スコア、コンボ、天体配列、状態などを返す
- `dump()` 盤面のテキスト表現を返す
- `step(ms)` ポーズやゲームオーバー中でも決定論的に時間を進める
- `aim(x)` 照準 X 座標を指定する
- `drop()` 現在の照準へ落下させる
- `spawnBody(tier, x, y)` 任意 tier の天体を配置する
- `setNext(tier)` 次に落とす天体を tier 0..4 で固定する
- `clearBoard()` 盤面を消す
- `gameOver()` ゲームオーバーにする

検証例:

```js
__game.aim(360)
__game.setNext(0)
__game.drop()
__game.step(800)
__game.spawnBody(0, 340, 500)
__game.spawnBody(0, 380, 500)
__game.step(1000)
__game.getState()
```

URL パラメータ:

- `?debug=1` FPS、物理体数、接触数などを表示
- `?seed=N` 乱数シードを固定
