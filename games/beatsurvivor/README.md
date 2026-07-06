# BEAT SURVIVOR

ネオンサバイバー × リズムゲーム。全自動攻撃が**ビート（132BPM）に量子化**されて発動し、**ビートに合わせてダッシュすると GROOVE が上がって火力が最大4倍**になる。曲はWebAudioでプロシージャル生成され、GROOVEが上がるほどレイヤーが増えて盛り上がる。3分後のボスを倒すか、5分生存でクリア。

## 起動

**`index.html` をダブルクリックするだけで遊べます**（`file://` 直開き対応）。

ローカルサーバー経由でも可: `python -m http.server 8125 --directory games/beatsurvivor` → http://localhost:8125/ （`.claude/launch.json` の `beatsurvivor` 設定でも起動可）

## 操作

### キーボード（PC）
| キー | 操作 |
|---|---|
| WASD / ←→↑↓ | 移動 |
| Space / J / K | ダッシュ（リズムアクション） |
| 1 / 2 / 3 | レベルアップ時の強化選択 |
| P / Esc | ポーズ |
| R | リスタート |
| M | ミュート |
| ` | デバッグオーバーレイ |

### タッチ（スマホ）
- 画面**左半分ドラッグ** = バーチャルスティック移動
- 画面**右半分タップ** = ダッシュ
- レベルアップカードはタップで選択

## メカニクス

- **ビートリング**: 自機に収束するリングがビートの目印。リングが自機に重なる瞬間がジャスト
- **ダッシュ判定**: ビート±80msで PERFECT（GROOVE+1・移動距離増・小衝撃波付き）、±150msで GOOD（維持）、それ以外は MISS（GROOVEが半減）
- **GROOVE**: 火力倍率 = 1 + GROOVE×0.15（最大×4.0）。PERFECTが8ビート途切れると1ずつ減衰。SFXの音程もGROOVEで上がる
- **武器はすべてビート同期**: ビートショット（毎拍）、サブウーファー（2拍）、ソニックノヴァ（4拍）、レーザーグリッド（8分音符）
- 敵もビートで脈動加速。スウォーム大量湧きやボスの突進もビート境界で発生
- ボス出現3:00 → 撃破でクリア（5:00生存でもクリア）

## URLパラメータ

- `?debug=1` — デバッグオーバーレイ表示
- `?seed=123` — 乱数シード固定（スポーン・強化候補の再現）

## デバッグAPI（`window.__game`）

セルフレビュー・自動検証用。決定論的にテストする場合は `pause()` してから `step(ms)` で進める。

| API | 説明 |
|---|---|
| `getState()` | HP・GROOVE・敵数・武器などのスナップショット |
| `dump()` | 状態サマリ＋近傍敵のテキストダンプ |
| `step(ms)` | 時間をms分進める（ポーズ中でも可） |
| `stepToBeatOffset(ms)` | 次のビート境界±msの時点まで進める（判定テスト用） |
| `dash()` | ダッシュ実行、判定('perfect'/'good'/'miss')を返す |
| `hold(mx, my)` | 移動入力を注入（-1..1） |
| `spawn(type, n, dist)` | 敵を出現（'chaser','swarm','tank','boss'） |
| `killAll()` | 全敵撃破（ジェムがドロップ） |
| `addXp(n)` | XP付与（レベルアップ誘発） |
| `choices()` / `pick(i)` | 強化候補の確認と選択 |
| `setGroove(n)` / `setHp(n)` / `teleport(x,y)` | 状態注入 |

検証例（PERFECT判定とGROOVE倍率）:

```js
__game.start(); __game.pause();
__game.stepToBeatOffset(0);   // ビート丁度まで進める
__game.dash();                 // → 'perfect'
__game.stepToBeatOffset(120);  // ビートから120msズラす
__game.dash();                 // → 'good'
__game.getState().grooveMult;  // 1.15
```
