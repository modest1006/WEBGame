# 定時ダッシュ TEIJI DASH

定時退社をダッシュでキメる1ボタンタイミングゲームです。月曜から金曜まで5日を走り切り、週間スコアと称号を狙います。

## 起動方法

- `games/teijidash/index.html` をブラウザで直接開けます。
- ローカルサーバーで確認する場合:

```powershell
python -m http.server 8128 --directory games/teijidash
```

その後 `http://localhost:8128/` を開きます。

## 操作

- Space / クリック / タップ: 1ボタン操作
- 第1幕: 長押しで帰り支度、離すと停止
- 第2幕: 18:00:00.000ちょうどを狙って押す
- 第3幕: QTEマーカーが重なる瞬間に押す
- R: リスタート
- M: ミュート
- P: ポーズ
- `: デバッグ表示

## 3幕構成

1. 仕込み: 上司が背を向けている間だけ支度します。PC、書類、カバン、上着の4段階で、支度中は派手に暴れます。見られた瞬間に発見され、時間と支度ゲージが少し削られます。
2. 定時ジャスト: BGMが止まり、秒針だけが鳴ります。PERFECTは±50ms、GREATは±150ms、GOODは±300msです。押した瞬間はスローになり、衝撃波から等速復帰します。
3. 退社ダッシュ: 自動横スクロールで走ります。同僚、書類、エレベーター、ワックス床を1ボタンQTEで突破します。金曜は部長の3連打QTEが出ます。

## スコア

日別スコアは、定時精度、支度完成度、ダッシュ中のコンボと被弾から計算します。5日終了後に週間スコア、称号、週間ベストを表示します。週間ベストは `localStorage` に保存されます。

## デバッグAPI

`?debug=1` でオーバーレイ表示、`?seed=N` で乱数固定です。

```js
__game.getState()
__game.dump()
__game.step(1000)
__game.press(true)
__game.release()
__game.pressAt(0)       // PERFECT扱い
__game.pressAt(120)     // GREAT扱い
__game.setAct(3)        // 退社ダッシュへ
__game.setDay(4)        // 金曜へ
__game.setPrep(100)
__game.bossLook(true)
__game.spawnQTE('elevator')
__game.finishDay()
__game.result()
```

検証例:

```js
__game.setAct(2); __game.pressAt(0); __game.getState()
__game.setAct(3); __game.spawnQTE('papers'); __game.step(900); __game.press(true); __game.getState()
__game.setDay(4); __game.setAct(3); __game.setPrep(100); __game.spawnQTE('director')
```
