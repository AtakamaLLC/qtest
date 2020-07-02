test = require('qtest')
assert = test.assert

test.add("basic", async (ctx)=>{
    let my = test.runner()
    
    my.add("t1", async (ctx)=>{
        ctx.log("loggy", "log")
        assert.equal(1,1)
    })
    
    results = await my.run()
    
    ctx.log(JSON.stringify(results))

    assert.equal(results.passed, 1)
    assert.equal(results.tests.t1.ok, true)
    assert.equal(results.tests.t1.log[0][1], "loggy")
})

test.add("param", async (ctx)=>{
    let my = test.runner()
   
    my.add("t1", async (ctx)=>{
        assert.equal(ctx.param, true)
    }, {param: [true, false]})
    
    results = await my.run()
    
    ctx.log(JSON.stringify(results))

    assert.equal(results.passed, 1)
    assert.equal(results.failed, 1)
    assert.equal(results.tests["t1:param=true"].ok, true)
    assert.equal(results.tests["t1:param=false"].ok, false)
    assert.ok(results.tests["t1:param=false"].err)
})

test.add("scoped", async (ctx)=>{
    let my = test.runner()
  
    my.before = (ctx) => {ctx.x = 1}
    my.add("t1", async (ctx) => {
        assert.equal(ctx.x, 1)
    })

    sub = my.scope("module")
    
    sub.add("t2", async (ctx) => {
        assert.strictEqual(ctx.x, undefined)
    })
    
    results = await my.run()
    
    ctx.log(JSON.stringify(results))

    assert.equal(results.passed, 2)
    assert.equal(results.tests["t1"].ok, true)
    assert.equal(results.scopes[0].tests["t2"].ok, true)
    assert.equal(results.scopes[0].name, "module")
})

test.add("skipped", async (ctx)=>{
    let my = test.runner()
  
    my.skip("t1", async (ctx) => {
        assert.equal(ctx.x, 1)
    })

    my.add("t2", async (ctx) => {
        assert.strictEqual(ctx.x, undefined)
    })
    
    results = await my.run()
    
    ctx.log(JSON.stringify(results))

    assert.equal(results.passed, 1)
    assert.equal(results.skipped, 1)
    assert.equal(results.tests["t1"].skipped, true)
})


test.add("parallel", async (ctx)=>{
    let my = test.runner()
    my.opts.parallel = ctx.parallel

    // this should take 100 ms, not 1 second if parallel is on
    let start = new Date().getTime();
    for (let i=0; i<10;++i) {
        my.add("t" + i, async (ctx)=>{
            ctx.log("slow")
            await my.sleep(100)
        })
    }
    results = await my.run()
    ctx.log(JSON.stringify(results))
    
    var end = new Date().getTime();
    var time = end - start;
    ctx.log("time: ", time)
    if (ctx.parallel) {
        assert.ok(time < 500)
    } else {
        assert.ok(time > 1000)
    }
}, {parallel: [true, false]})


test.add("translateError", async (ctx)=>{
    let my = test.runner()
   
    my.translateError = async (err) => {
       return "translated"
    }

    my.add("t1", async (ctx) => {
        assert.equal(0,1)
    })
    
    results = await my.run()
    
    ctx.log(JSON.stringify(results))

    assert.equal(results.tests.t1.err, "translated")
})

test.add("failAfter", async (ctx)=>{
    let my = test.runner()
  
    my.after = () => {
        throw "err"
    }

    my.add("t1", async (ctx) => {
        assert.equal(1,1)
    })
    
    results = await my.run()
    
    ctx.log(JSON.stringify(results))

    assert.equal(results.tests.t1.err, "err")
})

test.add("rxopt", async (ctx)=>{
    process.argv = ["-t", "t2"]

    let my = test.runner()
  
    my.add("t1", async (ctx) => {
    })
    
    my.add("t2", async (ctx) => {
    })
    
    sub = my.scope("module")
    
    sub.add("t2", async (ctx) => {
    })
    
    sub.add("t3", async (ctx) => {
    })
    
    results = await my.run()
    
    ctx.log(JSON.stringify(results))

    assert.equal(results.passed, 2)
    assert.equal(results.failed, 0)
})


test.add("async-ok", async (ctx) => {
    let my = test.runner()
    let inner = 0
    my.add("t0", async () => {
        // this has to run after all other async tests
        await test.sleep(100)
        inner = 1
    })
    let res = await my.run()

    assert.equal(inner, 1)
    assert.equal(res.passed, 1)
    ctx.log("ops...", res.asyncOps)
    assert.deepEqual(res.asyncOps, new Map())
})

test.skip("async-bad", async (ctx) => {
    test.sleep(2000)
})

test.add("async-fail", async (ctx) => {
    let my = test.runner()
    let forever = true
    let fn = async () => {
        while(forever) {
            await test.sleep(1)
        }
    }

    var promise
    my.add("t0", async () => {
        // leaves some horrible context around
        promise = fn()
    })
    let res = await my.run()
    ctx.log("async ops", res.asyncOps)

    forever = false
    try {
        assert.equal(res.passed, 1)
        assert.ok(res.asyncOps.size)
    } catch (e) {
        // clear sleep
        await promise
        throw(e)
    }
    await promise
})

try {
    require('sinon')
    test.add("sinon", async (ctx)=>{
        let fake = test.fn()
        fake(44)
        assert(fake.called)
        assert.called(fake)
    })
} catch(e) {
    test.skip("sinon")
}


test.run()
