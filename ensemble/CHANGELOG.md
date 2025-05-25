# Changelog

All notable changes to the @magi-system/ensemble package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2025-05-24

### BREAKING CHANGES

#### Replaced Async Generator with Callback-Based API

The core `request()` function now uses a callback-based event system instead of async generators for better performance and simpler cancellation.

**Before (v3.x):**

```typescript
for await (const event of request(model, messages, params)) {
    console.log('Event:', event);
}
```

**After (v4.0):**

```typescript
const cancel = request(model, messages, {
    ...params,
    onEvent: (event) => console.log('Event:', event),
    onError: (error) => console.error('Error:', error)
});
```

#### Updated RequestParams Interface

- `onEvent` is now **required** (was optional)
- Added optional `onError` callback for error handling
- Function now returns `CancelHandle` instead of `AsyncGenerator`

#### Provider Interface Changes

- Added optional `createResponse()` method to `ModelProvider` interface
- Existing `createResponseStream()` method remains for backward compatibility
- All major providers (Claude, OpenAI, Test) now implement both methods

### Added

- **AsyncQueue utility**: Generic async queue for bridging callback events to async iteration
- **CancelHandle interface**: Provides explicit cancellation control
- **Enhanced error handling**: Separate onError callback for better error management
- **Migration utilities**: Helper functions for transitioning from v3 to v4

### Changed

- **Performance improvements**: Eliminated iterator buffering overhead
- **Memory efficiency**: Reduced memory usage by removing accumulated iterator state
- **Better cancellation**: Explicit cancel() method replaces iterator.return()
- **Framework compatibility**: Improved integration with web workers, observables, and event systems

### Technical Details

#### New Utilities

- `AsyncQueue<T>`: Generic queue with async iteration support
- `CancelHandle`: Interface for request cancellation
- Enhanced timeout handling with automatic cleanup

#### Provider Updates

- All providers now support both generator and callback APIs
- Automatic fallback from callback to generator for providers not yet updated
- Improved error propagation and cancellation handling

### Performance Benefits

1. **Reduced Memory Usage**: No iterator state accumulation
2. **Faster Event Processing**: Direct callback invocation vs generator yield
3. **Better Cancellation**: Immediate cleanup vs iterator.return() delays
4. **Framework Integration**: Native compatibility with reactive systems

---

## [3.x.x] - Previous Releases

Previous releases used the async generator API. For historical changelog entries, see the git history or contact the maintainers.
