# オーケストレーター引き継ぎ書

このプロジェクトのオーケストレーター（仕様策定・レビュー・検証・統合の担当）向けの運用書。前任: Fable 5（2026-07-04〜07-07、11作）。読者想定: Claude Opus。

## 1. プロジェクトの現状

- ブラウザゲームのモノレポ。公開先: https://modest1006.github.io/WEBGame/ （GitHub Pages、pushで自動デプロイ）
- 完成済み11作は [README.md](README.md) の一覧参照。全作 `file://` 直開き対応・PC＋タッチ両対応・`window.__game` デバッグAPI持ち
- ローカル起動は `.claude/launch.json` に登録済み（ポート8120〜8133を使用中。**次の新作は8134**）

## 2. 体制と必読スキル

**あなた（オーケストレーター）は実装しない。** 実装はCodex（`mcp__codex__codex`）に委任し、あなたは仕様策定→レビュー→実機検証→統合→デプロイを担う。ユーザーが明示的に決めた分業体制。

作業前に必ず読む:
1. [.claude/skills/webgame-dev/SKILL.md](.claude/skills/webgame-dev/SKILL.md) — ゲーム実装規約（5原則・3D・Canvas性能・クリア可能性検証・デプロイ）
2. [.claude/skills/codex-delegation/SKILL.md](.claude/skills/codex-delegation/SKILL.md) — Codexへの呼び出しパラメータ・仕様書テンプレ・差し戻しのコツ

補助エージェント: deep-reasoner（重い推論）、fast-worker（機械的作業）も適宜。

## 3. 新作の標準パイプライン

1. **アイデア出し**: ユーザーと対話。過去作との掛け合わせ・スピンオフが好評（例: コロガリ魂→星喰い）。候補は複数案＋推しを添えて提示
2. **仕様策定**: codex-delegationスキルのテンプレで仕様書化。ユーザーの言葉はそのまま引用
3. **Codex実装**: 3D作品なら着工前に既存ゲームから `lib/three.min.js` を新ゲームディレクトリへコピー
4. **レビュー・検証**: preview起動→コンソールエラーゼロ→`__game` APIでルール検証（音声unlock済みで）→スクリーンショットで見た目確認→問題はcodex-replyで差し戻し（証拠＋原因仮説付き）
5. **統合**: ルート `index.html` にカード追加、ルート `README.md` に行追加、launch.jsonにポート追加（Codex側指示済みなら確認のみ）
6. **デプロイ**: テストで汚したlocalStorage（ベストスコア等）をリセット→プレビュー全停止→コミット→push→Pages配信をバックグラウンドのcurlループで監視→URLをユーザーに報告

## 4. デプロイの約束事

- コミットメールはnoreply（git config設定済み。実メールをコミットに含めない方針）
- コミット末尾に `Co-Authored-By: Claude <モデルのnoreply>` 行
- **JS/CSSを変更したら index.html のアセット参照 `?v=N` を必ずバンプ**（Pagesはmax-age=600でキャッシュされ新旧混在事故が起きる）
- ローカルパス・環境情報・実メールをリポジトリに入れない（ユーザーの明示方針）
- 配信確認: `curl` で `?v=N` の反映 or HTTP 200 をポーリング（バックグラウンド実行し、確認後にユーザーへ報告）

## 5. 検証環境の落とし穴（重要）

詳細はメモリ（自動読み込みされる `preview-verification-pitfalls`）にもあるが、要点:

- **プレビューが非表示だとスクショ不可**: ユーザー不在時はアプリのプレビューペインが表面に出ておらず `document.hidden=true`、rAF停止・canvasサイズ0。対処: ①ゲームの `window.__renderOnce(dt)` で手動描画（全作実装済み） ②canvasサイズをevalで強制設定 ③`tools/canvas_grab_server.py` を起動し、canvas.toDataURLをPOSTさせてJPEG保存→Readで目視
- **rAF停止トリック**: 実時間で流れる演出を静止画で撮るには `window.requestAnimationFrame = () => 0` でループを止め、`__game.step()`＋`__renderOnce()` で決定論的に狙いのフレームを作る（撮影後は `location.reload()` で復帰）
- **JSキャッシュ**: 編集が反映されない時はプレビュー再起動が確実
- **音声unlock**: SFX経路の検証はミュートボタン等のUI経由でunlockしてから（unlockなしだとSFXコードがスキップされバグを見逃す）
- **テスト失敗はまず自分の手順を疑う**: 座標系・状態の引き継ぎ・synthetic eventのkey/code指定など、テスト側のミスが実際半分以上だった
- Codexが検証サーバーを残しポートを塞ぐことがある→該当PIDをStop-Processしてからpreview_start

## 6. ユーザーの好み・作法

- **演出・エフェクトが最重要**。「動くだけ」は評価されない。バリエーション（同種演出も乱数で散らす、種別ごとの専用演出）を常に要求される
- リモート（スマホ）から遊んでフィードバックが来る。**モバイルの操作感・レイアウト・パフォーマンスは毎回検証**（縦持ち/横持ちも）。ウィジェットはリモートで見えないので重要情報は必ずテキストで
- ダメ出しは率直で的確（例:「当たり判定が全然わからん」）。原因を特定し、直したら数値やキャプチャの証拠付きで報告すると喜ばれる
- 「完成でいいよ」が出たらそれ以上磨かず次へ。改善余地はメモリの `webgame-backlog` に記録（次の候補: 夜景文明 = ライフゲーム観察ゲーの姉妹作）
- 得た知見はスキル/メモリへの永続化を強く求められる。「随時READMEも更新」

## 7. 参照先まとめ

| 何を知りたい | どこ |
|---|---|
| 実装規約 | `.claude/skills/webgame-dev/SKILL.md` |
| Codex委任の型 | `.claude/skills/codex-delegation/SKILL.md` |
| 検証の落とし穴・改善バックログ・ユーザー方針 | プロジェクトメモリ（自動読み込み、索引はMEMORY.md） |
| 各ゲームの遊び方/デバッグAPI | `games/<name>/README.md` |
| canvas取り出しツール | `tools/canvas_grab_server.py` |
