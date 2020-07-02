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
    constructor(name, opts) {
        this.name = name
        this.level = 0
        this._scopes = []
        this._tests = []
        this._skip = []
        this._color = {
            "reset" : "\x1b[0m",
            "green" : "\x1b[32m",
            "yellow" : "\x1b[33m",
            "red": "\x1b[31m",
        }
        this.opts = opts || {
            argparse: true,
            parallel: true,
            logcap: true,
            maxLevel: 3,
            rxlist: [],
        }
    
        this.parseArgs()
    }

    parseArgs() {
        let opts = this.opts
        if (process.argv && opts.argparse) {
            let argv = process.argv
            process.argv = []
            for (let i=0; i < argv.length; ++i) {
                if (argv[i] == "-t" || argv[i] == "-test") {
                    opts.rxlist.push(argv[i+1])
                }
                if (argv[i] == "-l" || argv[i] == "-linear") {
                    opts.parallel = false
                }
                if (argv[i] == "-s" || argv[i] == "-stdout") {
                    opts.logcap = false
                }
            }
        }
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
    
    skip(name, func, params) {
        this._skip.push({name: name, func: func, params: params})
    }
    
    async _run_test(t, opts, res) {
        let ok
        let logLines = []
        let local = {...opts}
        let err
        let errMsg

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
            console.log(this.color("green", this._levelPrefix() + "OK: "), t.name)
            ok = true
        } catch (e) {
            err = e
            errMsg = "FAIL: "
            ok = false
        }
        if (this.after) {
            try {
                await this.after(local)
            } catch (e) {
                err = e
                errMsg = "FAIL/AFTER: "
                ok = false
            }
        }
        if (!ok) {
            if (this.translateError) {
                err = await this.translateError(err)
            }
            console.log(this.color("red", this._levelPrefix() + errMsg), t.name, "# ", err)
            for (let ent of logLines) {
                ent.unshift("   ")
                console.log.apply(null, ent)
            }
        }

        if (ok) res.passed += 1
        if (!ok) res.failed += 1
        res.tests[t.name] = {
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

    async _run(opts) {
        let res = {
            name: this.name,
            passed: 0,
            skipped: 0,
            failed: 0,
            duration: null,
            tests: {},
        }
        let regex = new RegExp(opts.rxlist.join("|"))

        let startTime = new Date()

        let tests = []
        for (let t of this._tests) {
            let params = this.combinations(t.params)
            if (params.length == 0)
                params = [{}]

            for (let p of params) {
                let popt = {...opts, ...p}
                let ptest = {...t}
                ptest.name = this.paramName(t.name, p)
                if (opts.rxlist) {
                    if (!ptest.name.match(regex)) {
                        continue
                    }
                }
                let promise = this._run_test(ptest, popt, res)
                if (!opts.parallel)
                    await promise
                else
                    tests.push(promise)
            }
        }
        for (let t of this._skip) {
            console.log(this.color("yellow", this._levelPrefix() + "SKIP: "), t.name)
            res.skipped += 1
            res.tests[t.name] = {
                ok: false,
                skipped: true,
            }
        }
        await Promise.all(tests)
        if (!res.failed) {
            if (!res.passed) {
                process.exitCode = 2
                console.log("No tests run.")
            } else {
                process.exitCode = 0
            }
        } else {
            process.exitCode = 1
        }
        let endTime = new Date()

        res.duration = endTime - startTime
        return res
    }

    _levelPrefix() {
        return " ".repeat(this.level)
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

        if (this.name) {
            console.log(">>>>", this.name)
        }

        let opts = {
            rxlist: [],
            ...this.opts
        }
        
        if (this.beforeAll) 
            await this.beforeAll(opts)

        let res = await this._run(opts)
        
        if (this.afterAll) 
            await this.afterAll(opts)

        res.scopes = []
        for (let scope of this._scopes) {
            let sub = await scope.run()
            res.scopes.push(sub)
            res.passed += sub.passed
            res.failed += sub.failed
        }
        this.printSummary(this.level, res)
       return res
    }

    printSummary(level, res) {
        if (level != 0) {
            return
        }
        let args = [
            "PASSED:", res.passed,
            "FAILED:", res.failed,
        ]
        if (res.skipped) {
            args = args.concat(["SKIPPED:", res.skipped])
        }
        args = args.concat(["DURATION:", res.duration/1000])
        console.log("====", ...args)
    }

    sleep(milliseconds) {
      return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    runner(...args) {
        // used internally, make a new runner, and disables argument parsing
        let ret = new QTest(...args)
        ret.level = 1
        return ret
    }

    scope(name, opts) {
        opts = {...this.opts, ...opts}
        let ret = new QTest(name, opts)
        ret.level = Math.min(this.level + 1, this.opts.maxLevel)
        this._scopes.push(ret)
        return ret
    }
}

module.exports = new QTest()
