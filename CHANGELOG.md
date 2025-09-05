# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Sort JSON keys alphabetically in all generated translation files (fixes #60)

## [1.4.0] - 2025-02-22

### Added
- (ticaki) rimraf replaced by by internal tool.
- (hombach) change year to 2025
- (hombach) Fix two vulnerabilities
- (hombach) Bump dev dependencies
- (hombach) add tests for node.js 22, remove node 16 tests
- (@GermanBluefox) Added `convert` command to convert old i18n structure to new one
- (@GermanBluefox) Packages were updated
- (@UncleSamSwiss) Change default path for translation JSON files to `admin/i18n/en.json`; the old path is still supported for existing repositories

## [1.3.0] - 2024-02-18

### Added
- (kleinOr/Apollon77) Detects and keeps space indentation of io-package
- (Steiger04) Fix handling of dot keys for esbuild
- (Steiger04) Update esbuild and adjust watch mode
- (Steiger04) process.env.NODE_ENV is now also available server side

## [1.2.0] - 2022-10-23

### Added
- (Grizzlebee) only translate linkText from messages if existent
- (Apollon77) Add ukrainian as language for translations

## [1.1.0] - 2022-09-14

### Added
- (Grizzelbee) Also translate admin messages in io-package.json
- (AlCalzone) support specifying raw esbuild options, like loaders/plugins

## [1.0.1] - 2022-08-17

### Fixed
- make sure that also texts with multiple sentences are correctly translated via Google Translate