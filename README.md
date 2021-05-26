# ioBroker adapter-dev

All dependencies an ioBroker adapter developer needs.

[
![node](https://img.shields.io/node/v/@iobroker/adapter-dev.svg)
![npm](https://img.shields.io/npm/v/@iobroker/adapter-dev.svg)
](https://www.npmjs.com/package/@iobroker/adapter-dev)
![License](https://img.shields.io/npm/l/@iobroker/adapter-dev.svg)

## Installation

To use this library add it to your dev dependencies:

```bash
npm install --save-dev @iobroker/adapter-dev
```

## Gulp Tasks

To get all commonly used [gulp](https://gulpjs.com/) tasks, create a `gulpfile.js` in the root of your adapter project with the following code (or strip down the existing one):

```js
"use strict";

module.exports = require("@iobroker/adapter-dev/gulp")();
```

### Tasks

The following gulp tasks are available for all adapters:

-   `translate`: translates all strings in `io-package.json` and the i18n JSON files to all supported languages using Google Translate

For adapters that have a `words.js` file, the following additional tasks are available:

-   `adminWords2languages`: converts `words.js` to the different i18n JSON files; this should be used exactly once when there are no JSON files yet
-   `adminLanguages2words`: updates `words.js` from the different i18n JSON files; call this whenever you modify any of your JSON files manually. This is also automatically called by [Weblate](https://weblate.iobroker.net/) whenever translations are updated.
-   `translateAndUpdateWordsJS`: calls `translate` and afterwards updates `words.js`

### Options

The exported function for `gulp` supports an optional options object:

```js
module.exports = require("@iobroker/adapter-dev/gulp")({
	// add options here
});
```

If the options are not defined, defaults will be deduced from your project structure.

-   `ioPackage`: path to your io-package.json file; default: `./io-package.json`
-   `adminDir`: path to your admin directory; default: `./admin`
-   `words`: path to your words.js file; default: `<adminDir>/words.js` or `<adminDir>/js/words.js` or `undefined` if there is no words.js file
-   `i18nBase`:
    -   _EITHER_ a single path pointing to the English i18n base file
    -   _OR_ an array of paths to all English i18n base files
    -   default: `<adminDir>/i18n/en/translations.json` and/or `<adminDir>/src/i18n/en.json`
    -   the first item of the array will be used to generate `words.js`

## Changelog

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

### 0.0.4 (2021-05-26)

-   (UncleSamSwiss) Implemented gulp tasks very similar to the existing tasks

### 0.0.3 (2021-05-06)

-   (UncleSamSwiss) Fixed npm publishing

### 0.0.2 (2021-05-06)

-   (UncleSamSwiss) Initial repository setup
