# Changelog

## [1.6.4]:
 ### Changed
   - trackAsync output is better

## [1.6.3]:
 ### Changed
   - trackAsync useful

## [1.6.1]:
 ### Fixed
   - node 8 fix

## [1.6.0]:
 ### Added
   - use test() instead of test.add (if you want)

## [1.5.1]:
 ### Changed
   - --trackAsync to be off by default for real

## [1.5.0]:
 ### Changed
   - --trackAsync to be off by default
   - --exitMsecs 500
   - --noReject : don't fail on unhandled

 ### Changed
## [1.4.4]:
 ### Changed
   - Fiddling with async tracking stuff

## [1.4.2]:
 ### Changed
   - Sinon plugin works with scoped tests

## [1.4.1]:
 ### Changed
   - Package minor change

## [1.4.0]:
 ### Added
   - Track async calls.  Fail on unawaited.
   - Fail on unhandled promise rejections.
   - Options: -noreject, -noasync to disable these.
   - Show durations

## [1.3.0]:
 ### Added
   - If sinon is installed, expose assertions/mocks/spy's

## [1.2.2]:
 ### Changed
   - Fix some printing issues

## [1.2.1]:
 ### Changed
   - Test fails if 'after' fails
   - Reorgnize runner options
   - -t option works properly with scopes

 ### Added
   - Added changelog

## [1.1.2]:
 ### Added
   - test.skip() skips test
   - test.scope() creates new scope
