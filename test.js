const test = require('./qtest')
const assert = test.assert

test('basic', async (ctx) => {
  const my = test.runner()

  my.add('t1', async (ctx) => {
    ctx.log('loggy', 'log')
    assert.equal(1, 1)
  })

  const results = await my.run()

  ctx.log(JSON.stringify(results))

  assert.equal(results.passed, 1)
  assert.equal(results.tests.t1.ok, true)
  assert.equal(results.tests.t1.log[0][1], 'loggy')
})

test('param', async (ctx) => {
  const my = test.runner()

  my.add('t1', async (ctx) => {
    assert.equal(ctx.param, true)
  }, { param: [true, false] })

  const results = await my.run()

  ctx.log(JSON.stringify(results))

  assert.equal(results.passed, 1)
  assert.equal(results.failed, 1)
  assert.equal(results.tests['t1:param=true'].ok, true)
  assert.equal(results.tests['t1:param=false'].ok, false)
  assert.ok(results.tests['t1:param=false'].err)
})

test('scoped', async (ctx) => {
  const my = test.runner()

  my.before = (ctx) => { ctx.x = 1 }
  my.add('t1', async (ctx) => {
    assert.equal(ctx.x, 1)
  })

  const sub = my.scope('module')

  sub.add('t2', async (ctx) => {
    assert.strictEqual(ctx.x, undefined)
  })

  const results = await my.run()

  ctx.log(JSON.stringify(results))

  assert.equal(results.passed, 2)
  assert.equal(results.tests.t1.ok, true)
  assert.equal(results.scopes[0].tests.t2.ok, true)
  assert.equal(results.scopes[0].name, 'module')
})

test('skipped', async (ctx) => {
  const my = test.runner()

  my.skip('t1', async (ctx) => {
    assert.equal(ctx.x, 1)
  })

  my.add('t2', async (ctx) => {
    assert.strictEqual(ctx.x, undefined)
  })

  const results = await my.run()

  ctx.log(JSON.stringify(results))

  assert.equal(results.passed, 1)
  assert.equal(results.skipped, 1)
  assert.equal(results.tests.t1.skipped, true)
})

test('parallel', async (ctx) => {
  const my = test.runner()
  my.opts.parallel = ctx.parallel

  // this should take 100 ms, not 1 second if parallel is on
  const start = new Date().getTime()
  for (let i = 0; i < 10; ++i) {
    my.add('t' + i, async (ctx) => {
      ctx.log('slow')
      await my.sleep(100)
    })
  }
  const results = await my.run()
  ctx.log(JSON.stringify(results))

  var end = new Date().getTime()
  var time = end - start
  ctx.log('time: ', time)
  if (ctx.parallel) {
    assert.ok(time < 500)
  } else {
    assert.ok(time > 1000)
  }
}, { parallel: [true, false] })

test('translateError', async (ctx) => {
  const my = test.runner()

  my.translateError = async (errObj) => {
    return 'translated'
  }

  my.add('t1', async (ctx) => {
    assert.equal(0, 1)
  })

  const results = await my.run()

  ctx.log(JSON.stringify(results))

  assert.equal(results.tests.t1.err, 'translated')
})

test('failAfter', async (ctx) => {
  const my = test.runner()

  my.after = () => {
    throw Error('err')
  }

  my.add('t1', async (ctx) => {
    assert.equal(1, 1)
  })

  const results = await my.run()

  ctx.log(JSON.stringify(results))

  assert.deepEqual(results.tests.t1.err, Error('err'))
})

test('rxopt', async (ctx) => {
  process.argv = ['-t', 't2']

  const my = test.runner()

  my.add('t1', async (ctx) => {
  })

  my.add('t2', async (ctx) => {
  })

  const sub = my.scope('module')

  sub.add('t2', async (ctx) => {
  })

  sub.add('t3', async (ctx) => {
  })

  const results = await my.run()

  ctx.log(JSON.stringify(results))

  assert.equal(results.passed, 2)
  assert.equal(results.failed, 0)
})

test('async-ok', async (ctx) => {
  const my = test.runner()
  let inner = 0
  my.add('t0', async () => {
    // this has to run after all other async tests
    await test.sleep(100)
    inner = 1
  })
  const res = await my.run()
  ctx.log('ops...', res.asyncOps)
  ctx.log('kids...', my._asyncKids)
  ctx.log('parents...', my._asyncParent)

  // we don't leave crap around
  assert.deepEqual(my._asyncKids, new Map())
  assert.deepEqual(my._asyncParent, new Map())

  assert.equal(inner, 1)
  assert.equal(res.passed, 1)
  assert.equal(res.unawaited, 0)
})

test.skip('async-bad', async (ctx) => {
  test.sleep(2000)
})

test('async-fail', async (ctx) => {
  const my = test.runner()
  let forever = true
  const fn = async () => {
    while (forever) {           // eslint-disable-line
      console.log('forever')
      await test.sleep(10)
    }
  }

  var promise
  my.add('t0', async () => {
    // leaves some horrible context around
    promise = fn()
  })
  const res = await my.run()
  ctx.log('async ops', res.asyncOps)

  forever = false
  try {
    assert.equal(res.passed, 1)
    assert.ok(res.unawaited > 0)
  } catch (e) {
    // clear sleep
    await promise
    throw (e)
  }

  // we unwind cleanly, even with an unawaited promise lying around
  ctx.log('async ops', res.asyncOps)
  assert.deepEqual(my._asyncKids, new Map())
  assert.deepEqual(my._asyncParent, new Map())

  await promise
})

test('sinon', async (ctx) => {
  const fake = test.fn()
  fake(44)
  assert(fake.called)
  assert.called(fake)
})

test.run()
