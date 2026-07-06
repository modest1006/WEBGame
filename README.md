# WEB Game Arcade

ブラウザでそのまま遊べる自作ゲーム集。ビルド不要・依存ライブラリなし（素材はすべてコードで生成）。PC（キーボード）とスマホ（タッチ）両対応。

## Games

| ゲーム | ジャンル | 概要 |
|---|---|---|
| [NEON TETRIS](games/tetris/) | パズル | SRS回転・7-bag・ホールド・B2B/コンボ採点のテトリス |
| [BUNNY DASH](games/bunnyhop/) | アクション | スライディング×ジャンプの「バニーホップ」で加速するタイムアタック |
| [BEAT SURVIVOR](games/beatsurvivor/) | サバイバー×リズム | 全攻撃がビート同期。ビートに乗ってダッシュすると火力最大4倍 |

## 遊び方

- **オンライン**: GitHub Pages でそのまま遊べます（リポジトリ設定の Pages URL から）
- **ローカル**: 各ゲームの `index.html` をダブルクリックするだけ（`file://` 直開き対応）

操作方法・デバッグAPIは各ゲームの README を参照。

## 開発

- 各ゲームは `games/<name>/` に自己完結（構成規約は [.claude/skills/webgame-dev/SKILL.md](.claude/skills/webgame-dev/SKILL.md)）
- すべてのゲームは `window.__game` デバッグAPIを持ち、ヘッドレスに検証可能
