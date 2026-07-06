# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

ブラウザで遊べるゲームを多数作っていくモノレポ。ゲームごとにサブディレクトリを切って独立させる。

## Implementation rules

ゲームの実装・修正・レビューの前に、必ず `webgame-dev` スキル（`.claude/skills/webgame-dev/SKILL.md`）を読んで従うこと。要点: ファイル分割（単一巨大HTML禁止）、`window.__game` デバッグAPI実装とセルフレビュー必須、演出のディテール、ゲーム毎の専用UIデザイン、PC＋タッチ両対応。

## Repository structure

- 各ゲームは `games/<game-name>/` 配下に自己完結させる（例: `games/tetris/`, `games/shooting/`）。
- ゲーム間でコードを共有する場合のみ `shared/` を作る。安易な共通化より、各ゲームの独立性を優先する。
- 新しいゲームを作るときは、既存ゲームのディレクトリ構成・ツールチェインに合わせる。ゲームごとに `README.md` で遊び方と起動方法を書く。
- ビルド・実行コマンドはゲームごとに異なりうる。作業前に対象ゲームのディレクトリの `package.json` / README を確認すること。ルートには共通のビルド設定を置かない（各ゲームが自分のツールチェインを持つ）。

## Orchestration workflow

You (Fable) are the orchestrator. Plan, decompose, synthesize.
Reasoning-heavy phases → deep-reasoner
Mechanical work → fast-worker
Codex (/codex:rescue --background) is a cracked engineer on par with deep-reasoner, from a different perspective. Treat as a peer, not a reviewer.
High-stakes decisions: task Opus + Codex on the same problem in parallel, synthesize the best of both, without showing either the other's answer. Keep your own context lean.
