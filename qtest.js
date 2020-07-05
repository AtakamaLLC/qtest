/*
 * Very simple test runner for nodejs:
 *
 * Supports:
 *
 *    before, after, beforeAll, afterAll
 *    fixture object passed to each test, that before/after/beforeAll/afterAll can modify
 *    -[t]est option on command line to pick tests to run
 *    -[l]inear option on command to disable parallel
 *    built in fixture logger, captures log lines, adds line numbers/file names/timestamps
 *
 * Synopsis:
 *    test = require('testman')
 *    assert = require('assert')
 *
 *    test("hello", ()=>{
 *      assert.equals(1,1)
 *    })
 *
 *    test.run()
 *
 */

var AsyncHooks

try {
  AsyncHooks = require('async_hooks')
} catch (e) { // eslint-disable-line no-unused-vars
  // async not supported
  AsyncHooks = null
}

const assert = require('assert')

class QTest extends Function {
  constructor (name, opts) {
    super('...args', 'return this._bound.add(...args)')
    this._bound = this.bind(this)
    const inst = this._bound

    inst._name = name
    inst.level = 0
    inst._asyncOps = new Map()
    inst._scopes = []
    inst._tests = []
    inst._skip = []
    inst._color = {
      reset: '\x1b[0m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m'
    }
    inst.opts = opts || {
      argparse: true,
      parallel: true,
      logcap: true,
      maxLevel: 3,
      trackAsync: false,
      failUnhandled: true,
      exitMsecs: 500,
      rxlist: []
    }

    inst.parseArgs()
    inst.addPlugins()

    return inst
  }

  addPlugins () {
    this.assert = assert

    try {
      // if you have sinon in your devDeps... add them to the test singleton
      var sinon = require('sinon')

      // more clear names since they are top level
      this.fn = sinon.fake
      this.replaceFn = sinon.replace
      this.argsMatch = sinon.match

      // expose most of sinon to the top level
      this.spy = sinon.spy
      this.stub = sinon.stub
      this.createSandbox = sinon.createSandbox
      this.replaceGetter = sinon.replaceGetter
      this.replaceSetter = sinon.replaceSetter
      this.restoreObject = sinon.restoreObject
      this.useFakeTimers = sinon.useFakeTimers
      this.useFakeXMLHttpRequest = sinon.useFakeXMLHttpRequest

      sinon.assert.expose(assert, { prefix: '', includeFail: false })
    } catch (e) { // eslint-disable-line no-unused-vars
      this.fn = () => { throw Error('yarn add `sinon` first') }
    }
  }

  printUsage () {
    console.log(`
Options:
    -t | --test <regex>     : regex match tests
    -l | --linear           : no async run
    -s | --stdout           : all errs to stdout
    --noReject              : allow unhandled rejections
    --trackAsync            : disable async tracking
    --exitMsecs             : exit after (500) msecs when tests are done
        `)
  }

  parseArgs () {
    const opts = this.opts
    if (process.argv && opts.argparse) {
      const argv = process.argv
      process.argv = []
      for (let i = 0; i < argv.length; ++i) {
        if (argv[i] === '-t' || argv[i] === '--test') {
          opts.rxlist.push(argv[i + 1])
        }
        if (argv[i] === '-l' || argv[i] === '--linear') {
          opts.parallel = false
        }
        if (argv[i] === '-s' || argv[i] === '--stdout') {
          opts.logcap = false
        }
        if (argv[i] === '--exitMsecs') {
          opts.exitMsecs = parseInt(argv[i + 1])
          if (isNaN(opts.exitMsecs)) {
            throw Error('exitMsecs must be a number')
          }
        }
        if (argv[i] === '--trackAsync') {
          opts.trackAsync = true
        }
        if (argv[i] === '--noReject') {
          opts.failUnhandled = false
        }
        if (argv[i] === '-help' || argv[i] === '--help') {
          this.printUsage()
          process.exit(1)
        }
      }
    }
  }

  color (name, str) {
    return this._color[name] + str + this._color.reset
  }

  getErr () {
    try { throw Error('') } catch (err) { return err }
  }

  _logTo (logLines, ...args) {
    const err = this.getErr()
    let frame = err.stack.split('\n')[4]
    frame = frame.replace('(C:', '(/c/')
    const lineNumber = frame.split(':')[1]
    const filePath = frame.split(':')[0].split('(')[1]
    let fileName = filePath.replace(/\\/g, '/').split('/')
    fileName = fileName[fileName.length - 1]
    const fileInfo = fileName + ':' + lineNumber
    const d = new Date()
    const t = d.toLocaleTimeString().slice(0, -3) + '.' + d.getMilliseconds()
    logLines.push(['[' + t + '] ' + fileInfo, ...args])
  }

  add (name, func, params) {
    this._tests.push({ name: name, func: func, params: params })
  }

  skip (name, func, params) {
    this._skip.push({ name: name, func: func, params: params })
  }

  async _runTest (t, opts, res) {
    let ok
    const logLines = []
    const local = { ...opts }
    let err
    let errMsg

    if (opts.logcap) {
      local.log = (...args) => {
        this._logTo(logLines, ...args)
      }
    } else {
      local.log = console.log
    }

    let duration = 0
    try {
      if (this.before) { await this.before(local) }
      const startTime = new Date()
      await t.func(local)
      duration = new Date() - startTime
      console.log(this.color('green', this._levelPrefix() + 'OK: '), t.name, duration / 1000)
      ok = true
    } catch (e) {
      err = e
      errMsg = 'FAIL: '
      ok = false
    }

    if (this.after) {
      try {
        await this.after(local)
      } catch (e) {
        err = e
        errMsg = 'FAIL/AFTER: '
        ok = false
      }
    }
    if (!ok) {
      if (this.translateError) {
        err = await this.translateError(err)
      }
      console.log(this.color('red', this._levelPrefix() + errMsg), t.name, '# ', err)
      for (const ent of logLines) {
        ent.unshift('   ')
        console.log.apply(null, ent)
      }
    }

    if (ok) res.passed += 1
    if (!ok) res.failed += 1
    res.tests[t.name] = {
      ok: ok,
      err: err,
      log: logLines,
      time: duration
    }
  }

  combinations (obj) {
    if (!obj) {
      return []
    }
    if (this.isEmpty(obj)) {
      return [obj]
    }
    const res = []
    for (const k in obj) {
      for (const v of obj[k]) {
        const sub = { ...obj }
        delete sub[k]
        for (const s of this.combinations(sub)) {
          s[k] = v
          res.push(s)
        }
      }
    }
    return res
  }

  isEmpty (obj) {
    return Object.keys(obj).length === 0
  }

  _paramName (param) {
    let name = ''
    for (const k in param) {
      name += ':' + k
      name += '=' + param[k]
    }
    return name
  }

  paramName (base, param) {
    return base + this._paramName(param)
  }

  async _run (opts) {
    const res = {
      name: this._name,
      passed: 0,
      skipped: 0,
      failed: 0,
      duration: null,
      tests: {}
    }
    const regex = new RegExp(opts.rxlist.join('|'))

    const testMatch = (name) => {
      return !opts.rxlist || name.match(regex)
    }

    const startTime = new Date()

    const tests = []
    let first = true
    for (const t of this._tests) {
      let params = this.combinations(t.params)
      if (params.length === 0) { params = [{}] }

      for (const p of params) {
        const popt = { ...opts, ...p }
        const ptest = { ...t }
        ptest.name = this.paramName(t.name, p)
        if (!testMatch(t.name)) { continue }

        if (this._name && first) {
          console.log('>>>>', this._name)
          first = false
        }
        const promise = this._runTest(ptest, popt, res)
        if (!opts.parallel) { await promise } else { tests.push(promise) }
      }
    }
    for (const t of this._skip) {
      if (!testMatch(t.name)) {
        continue
      }
      console.log(this.color('yellow', this._levelPrefix() + 'SKIP: '), t.name)
      res.skipped += 1
      res.tests[t.name] = {
        ok: false,
        skipped: true
      }
    }
    await Promise.all(tests)
    const endTime = new Date()

    res.duration = endTime - startTime
    return res
  }

  _levelPrefix () {
    return ' '.repeat(this.level)
  }

  onAsyncInit (id, type, trigger) {
    if (type !== 'PROMISE') {
      return
    }
    const error = {}
    Error.captureStackTrace(error)
    const stack = error.stack.split('\n').map(line => line.trim())
    stack.splice(0, 4)
    if (stack.length === 0) {
      return
    }
    if (stack[0].includes('at QTest.') ||
            (stack[1] && stack[1].includes('at QTest.')) ||
            stack[stack.length - 1].includes(' (internal/') ||
            stack[stack.length - 1].includes('/node_modules/nyc') ||
            false
    ) { return }
    const asyncOp = {
      id,
      type,
      trigger,
      stack
    }
    this._asyncOps.set(id, asyncOp)
  }

  onAsyncDone (id) {
    this._asyncOps.delete(id)
  }

  asyncSummary () {
    if (this._asyncOps.length) { console.log('==== ASYNC REPORT ====') }
    for (const op of this._asyncOps.values()) {
      console.log(op)
    }
  }

  async run () {
    /*
         * returns an object with:
         *  passed: <number>
         *  failed: <number>
         *  tests: {
         *      <test-name> : {
         *          ok: <bool>
         *          log: <list>
         *          err: <exception>
         *      }
         *  }
         */

    const opts = {
      rxlist: [],
      ...this.opts
    }

    let asyncHook
    if (this.opts.trackAsync && AsyncHooks) {
      asyncHook = AsyncHooks.createHook({
        init: this.onAsyncInit.bind(this),
        destroy: this.onAsyncDone.bind(this),
        promiseResolve: this.onAsyncDone.bind(this)
      })
      asyncHook.enable()
    }

    if (this.opts.failUnhandled && this.level === 0) {
      process.on('unhandledRejection', (reason, p) => {
        console.log('Unhandled Rejection at: Promise', p, 'reason:', reason)
        process.exit(3)
      })
    }

    if (this.beforeAll) { await this.beforeAll(opts) }

    const res = await this._run(opts)

    if (this.afterAll) { await this.afterAll(opts) }

    res.scopes = []
    for (const scope of this._scopes) {
      const sub = await scope.run()
      res.scopes.push(sub)
      res.passed += sub.passed
      res.failed += sub.failed
    }
    if (this.trackAsync && this._asyncOps.length > 0 && asyncHook) {
      await this.sleep(this.exitMsecs)
      asyncHook.disable()
    }
    res.asyncOps = this._asyncOps

    await this.printSummary(this.level, res)

    if (!res.failed) {
      if (!res.passed && this.level === 0) {
        process.exitCode = 2
        console.log('No tests run.')
      } else {
        process.exitCode = 0
      }
    } else {
      process.exitCode = 1
    }

    if (this.level === 0 && this.opts.exitMsecs) {
      setTimeout(this.forceExit, this.opts.exitMsecs)
    }
    return res
  }

  forceExit () {
    process.exit()
  }

  async printSummary (level, res) {
    if (level !== 0) {
      return
    }
    let args = [
      'PASSED:', res.passed,
      ', FAILED:', res.failed
    ]
    if (res.skipped) {
      args = args.concat([', SKIPPED:', res.skipped])
    }
    args = args.concat([', DURATION:', res.duration / 1000])

    this.asyncSummary()

    if (res.asyncOps.size) {
      args = args.concat([', UNAWAITED:', res.asyncOps.size])
    }

    console.log('====', ...args)

    if (res.asyncOps.size) {
      process.exit(3)
    }
  }

  sleep (milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
  }

  runner (opts) {
    // used for testing self: make a new runner, and disables argument parsing
    const ret = new QTest(undefined, { ...this.opts, rxlist: [], trackAsync: true, ...opts })
    ret.level = 1
    return ret
  }

  scope (name, opts) {
    // make a new runner, add to this runner's 'scopes' list
    opts = { ...this.opts, ...opts, trackAsync: false }
    const ret = new QTest(name, opts)
    ret.level = Math.min(this.level + 1, this.opts.maxLevel)
    this._scopes.push(ret)
    return ret
  }
}

const runner = new QTest()
module.exports = runner
