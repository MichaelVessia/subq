# Effect HttpApi Best Practices

## Core Problem

Avoid using `Schema.String` for API parameters and then manually decoding values within handlers. This creates:
- Repetitive validation code across handlers
- Inconsistent error handling approaches
- Loss of compile-time type guarantees at boundaries

## Recommended Approach

Leverage branded domain schemas directly in endpoint definitions. HttpApi automatically decodes path params, URL params, headers, and payloads using `Schema.decodeUnknown`.

## Schema Design Guidelines

### Path Parameters

Use branded string schemas that enforce format constraints via patterns and branding:

```typescript
const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type
```

### Query Parameters

Apply transforming schemas for non-string types:

```typescript
const BooleanFromString = Schema.transform(
  Schema.String,
  Schema.Boolean,
  {
    decode: (s) => s === "true",
    encode: (b) => String(b)
  }
)

const NumberFromString = Schema.NumberFromString
```

### Request Bodies

Reuse domain entity schemas. Use `Schema.OptionFromNullOr` for nullable fields and `Schema.DateTimeUtc` for timestamps:

```typescript
class CreateWeightEntry extends Schema.Class<CreateWeightEntry>("CreateWeightEntry")({
  weight: Schema.Number,
  date: Schema.DateTimeUtc,
  notes: Schema.OptionFromNullOr(Schema.String)
}) {}
```

### Response Bodies

Return domain entities directly or wrap in response classes with metadata:

```typescript
class WeightEntryResponse extends Schema.Class<WeightEntryResponse>("WeightEntryResponse")({
  entry: WeightEntry,
  trend: Schema.Option(TrendData)
}) {}
```

## Error Handling

Annotate error schemas with HTTP status codes. Let HttpApi automatically convert invalid inputs to 400 Bad Request responses:

```typescript
class NotFoundError extends Schema.TaggedError<NotFoundError>("NotFoundError")({
  message: Schema.String
}) {}

// In API definition
HttpApiEndpoint.get("getEntry")
  .setPath("/entries/:id")
  .addError(NotFoundError, { status: 404 })
```

## Checklist

1. Use branded strings for path parameters
2. Apply transforming schemas for query parameters
3. Leverage domain schemas in request/response definitions
4. Annotate errors with appropriate status codes
5. Eliminate manual `Schema.decode*` calls from handlers
