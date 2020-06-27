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
 *    test.add("hello", ()=>{
 *      assert.equals(1,1)
 *    })
 *
 *    test.run()
 *
 */

class QTest {
    constructor() {
        this._tests = []
        this._color = {
            "reset" : "\x1b[0m",
            "green" : "\x1b[32m",
            "red": "\x1b[31m",
        }
        this.opts = {}
        this.argparse = true
    }

    color(name, str) {
        return this._color[name] + str + this._color.reset
    }

    getErr() {
        try { throw Error('') } catch(err) { return err; }
    }

    _logTo(logLines, ...args) {
        let err = this.getErr();
        let frame = err.stack.split("\n")[4];
        let lineNumber = frame.split(":")[1];
        let filePath = frame.split(":")[0].split('(')[1];
        let fileName = filePath.replace(/\\/g, '/').split('/')
        fileName = fileName[fileName.length - 1]
        let fileInfo = fileName + ":" + lineNumber
        let d = new Date();
        let t = d.toLocaleTimeString().slice(0,-3) + "." + d.getMilliseconds()
        logLines.push(["[" + t + "] " + fileInfo, ...args])
    }
    
    add(name, func, params) {
        this._tests.push({name: name, func: func, params: params})
    }
    
    async _run_test(t, opts, ctx) {
        let ok
        let logLines = []
        let local = {...opts}
        let err

        if (opts.logcap) {
            local.log = (...args) => {
                this._logTo(logLines, ...args)
            }
        } else {
            local.log = console.log
        }
            
        try {
            if (this.before) 
                await this.before(local)
            await t.func(local)
            console.log(this.color("green", "OK: "), t.name)
            ok = true
        } catch (e) {
            err = e
            ok = false
            if (this.translateError) {
                err = await this.translateError(err)
            }
            console.log(this.color("red", "FAIL: "), t.name, "# ", err)
            for (let ent of logLines) {
                ent.unshift("   ")
                console.log.apply(null, ent)
            }
        }
        if (this.after) 
            await this.after(local)
        if (ok) ctx.passed += 1
        if (!ok) ctx.failed += 1
        ctx.tests[t.name] = {
            ok: ok,
            err: err,
            log: logLines,
        }
    }
   
    combinations(obj) {
        if (!obj) {
            return []
        }
        if (this.isEmpty(obj)) {
            return [obj]
        }
        let res = []
        for (let k in obj) {
            for (let v of obj[k]) {
                let sub = {...obj}
                delete sub[k]
                for (let s of this.combinations(sub)) {
                    s[k] = v
                    res.push(s)
                }
            }
        }
        return res
    }
    
    isEmpty(obj) {
      return Object.keys(obj).length === 0;
    }

    _paramName(param) {
        let name = ""
        for (let k in param) {
            name += ":" + k
            name += "=" + param[k]
        }
        return name
    }

    paramName(base, param) {
        return base + this._paramName(param)
    }

    async _run(tl, opts) {
        let ctx = {
            passed: 0,
            failed: 0,
            tests: {},
        }
        let regex = new RegExp(tl.join("|"))

        let tests = []
        for (let t of this._tests) {
            if (tl) {
                if (!t.name.match(regex)) {
                    continue
                }
            }

            let params = this.combinations(t.params)
            if (params.length == 0)
                params = [{}]

            for (let p of params) {
                let popt = {...opts, ...p}
                let ptest = {...t}
                ptest.name = this.paramName(t.name, p)
                let promise = this._run_test(ptest, popt, ctx)
                if (!opts.parallel)
                    await promise
                else
                    tests.push(promise)
            }
        }
        await Promise.all(tests)
        if (!ctx.failed) {
            if (!ctx.passed) {
                process.exitCode = 2
                console.log("No tests run.")
            } else {
                process.exitCode = 0
            }
        } else {
            process.exitCode = 1
        }
        return ctx
    }

    async run() {
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

        let tl = []
        let opts = {
            parallel: true,
            logcap: true,
            ...this.opts
        }
        
        if (process && this.argparse) {
            let argv = process.argv
            for (let i=0; i < argv.length; ++i) {
                if (argv[i] == "-t" || argv[i] == "-test") {
                    tl.push(argv[i+1])
                }
                if (argv[i] == "-l" || argv[i] == "-linear") {
                    opts.parallel = false
                }
                if (argv[i] == "-s" || argv[i] == "-stdout") {
                    opts.logcap = false
                }
            }
        }

        if (this.beforeAll) 
            await this.beforeAll(opts)

        let res = await this._run(tl, opts)
        
        if (this.afterAll) 
            await this.afterAll(opts)

        return res
    }

    sleep(milliseconds) {
      return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    runner(...args) {
        let ret = new QTest(...args)
        ret.argparse = false
        return ret
    }
}

module.exports = new QTest()
