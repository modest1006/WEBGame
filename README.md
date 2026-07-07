# WEB Game Arcade

ブラウザでそのまま遊べる自作ゲーム集。ビルド不要（3D作品はThree.jsを同梱、素材はすべてコードで生成）。PC（キーボード/マウス）とスマホ（タッチ）両対応。

**▶ 遊ぶ: https://modest1006.github.io/WEBGame/**

## Games

| ゲーム | ジャンル | 概要 |
|---|---|---|
| [NEON TETRIS](games/tetris/) | パズル | SRS回転・7-bag・ホールド・B2B/コンボ採点のテトリス |
| [BUNNY DASH](games/bunnyhop/) | アクション | スライディング×ジャンプの「バニーホップ」で加速するタイムアタック |
| [BEAT SURVIVOR](games/beatsurvivor/) | サバイバー×リズム | 全攻撃がビート同期。ビートに乗ってダッシュすると火力最大4倍 |
| [COSMIC MERGE](games/cosmicmerge/) | 物理パズル | 天体を落として合体進化。星屑からブラックホールまで。自作2D円物理 |
| [NEON DRIVE](games/neondrive/) | レース | シンセウェイヴの夜を走る疑似3Dドライブ。ニアミスでブースト |
| [定時ダッシュ](games/teijidash/) | タイミング×コメディ | 爆音で帰り支度→18:00:00.000ジャスト立ち→退社ダッシュの3幕構成 |
| [ROLL MAZE](games/rollmaze/) | 3Dパズル | 盤面を傾けてボールを転がす3D迷路。全8ステージ星3制（Three.js） |
| [HELLBREAK](games/hellbreak/) | FPS | 90年代スタイルのレトロFPS。悪魔の要塞3レベルを突破（Three.js） |
| [コロガリ魂](games/korogari/) | 3Dアクション | 粘着ボールで画鋲からトラックまで巻き込んで成長（Three.js） |
| [星喰い](games/hoshikui/) | 3Dアクション | 岩石から始めて公転する星々を喰らい、ブラックホールへ進化（Three.js） |

## 遊び方

- **オンライン**: 上記 GitHub Pages URL からそのまま
- **ローカル**: 各ゲームの `index.html` をダブルクリックするだけ（`file://` 直開き対応、ES modules不使用）

操作方法・デバッグAPIは各ゲームの README を参照。

## 開発

- 各ゲームは `games/<name>/` に自己完結（構成規約は [.claude/skills/webgame-dev/SKILL.md](.claude/skills/webgame-dev/SKILL.md)）
- ロジック（`game.js`）は描画非依存の決定論実装で、すべてのゲームが `window.__game` デバッグAPIを持ちヘッドレスに検証可能
- 3D作品は Three.js r147（UMD）を各ゲームの `lib/` に同梱
- 音はすべて WebAudio によるプロシージャル合成（外部音源ファイルなし）
