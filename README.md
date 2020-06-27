[![Build Status](https://travis-ci.com/AtakamaLLC/qtest.svg?branch=master)](https://travis-ci.com/AtakamaLLC/qtest)
[![codecov](https://codecov.io/gh/AtakamaLLC/qtest/branch/master/graph/badge.svg)](https://codecov.io/gh/AtakamaLLC/qtest)

# qtest

Simple test runner for nodejs.

### Install:

```
npm install @atakama/qtest
```


### Use:

```js
test = require('@atakama/qtest')
assert = require('assert')

test.add("test name", async (ctx)=>{
    ctx.log("some log")

    assert.equal(ctx.someFixture, 444)

    // parameterized test
    assert.equal(ctx.param, true)
}, {param: [true, false]})

test.beforeAll = async (ctx) => {
    ctx.someFixture = 444
}

test.run()
```

### Coverage:

```
npm install nyc
node_modules/.bin/nyc node test.js
```


### Other features:

 - cli options 
   - -t \<test-name\> : pick a test to run
   - -l : disable parallelism 
   - -s : disable log cap
 - before/after/beforeAll/afterAll
   - does what you expect
 - fixtures
   - beforeAll/before/after/afterAll take objects... stuff your fixtures in there
