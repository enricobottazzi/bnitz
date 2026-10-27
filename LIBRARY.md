# bnitz: minimal reduction demo

The prototype takes a sentence, expresses it using concepts from a small library, and applies rewrite rules until only primitives remain.

## 1. Concept calls

Each concept has a name and inputs. Calls use ordinary function notation:

```text
SOMEONE("Alice")
BEFORE(NOW())
DIED(SOMEONE("Alice"))
```

Calls can represent people, times, or claims. The last call expresses “Alice died.” Expressing a claim does not establish its truth.

## 2. Primitives

Primitives are the agreed stopping points for reduction.

| Concept call | Meaning |
| --- | --- |
| `SOMEONE("name")` | The person named in the sentence; their identity may remain unresolved. |
| `NOW()` | The present moment in the sentence's context. |
| `BEFORE(time)` | The period before the supplied time. |
| `DIE(person, time)` | The person dies at the supplied time |

`NOW()` retains the sentence's context throughout reduction.

## 3. Rewrite rules

A derived concept is defined by rewrite rules using simpler concepts:

```text
DIED(person)
    → DIE(person, BEFORE(NOW()))
```

The reducer applies the stored rules and records every step. An LLM does not invent new definitions during reduction.

Rewrite rules must preserve the result type. Here, both `DIED(person)` and its expansion have type `Claim`.

## 4. Types and checking

Types are metadata used to check calls. They are not additional semantic primitives or concepts to reduce.

| Type | Represents |
| --- | --- |
| `Text` | Literal text, such as `"Alice"`. |
| `Person` | A person reference. |
| `Time` | A moment or a period. |
| `Claim` | A call expressing a claim. |

`Claim` classifies the call itself; it does not wrap it in another object or establish its truth.

Each concept declares a signature:

```text
SOMEONE(name: Text) → Person
NOW() → Time
BEFORE(time: Time) → Time
DIE(person: Person, time: Time) → Claim
DIED(person: Person) → Claim
```

The checker looks up the signature, checks the number of arguments, recursively determines each argument's type, and compares it with the required type. The call's result type comes from its signature, not its name. Thus `NOW()` and `BEFORE(...)` both provide `Time` values.

For example, `DIE(NOW(), SOMEONE("Alice"))` fails at argument 1: expected `Person`, received `Time`.

In a rewrite definition, the inputs take their types from the concept's signature. Check that the replacement has the same result type as the original call.

Start with the “Alice died” example and the definition above. Precise date forms and broader language support can come later. The initial translation and the definitions must still be reviewed for whether they preserve the intended meaning.

## 5. Reduction

An LLM proposes a translation of the sentence into concept calls from the library. Check that the complete call has type `Claim` and that each argument matches its signature. The reducer then applies matching rewrite rules, checks the resulting calls, and repeats until every branch contains only declared primitives and literal data. The output shows the original sentence, its interpretation, the type checks, and each rewrite. Missing definitions, incorrect arguments, or circular rewrites produce `UNDEFINED`, identifying the call and the point where reduction stopped.

For “Alice died”:

```text
DIED(SOMEONE("Alice"))
    → DIE(SOMEONE("Alice"), BEFORE(NOW()))
```

`SOMEONE("Alice")` has type `Person`; `NOW()` and `BEFORE(NOW())` have type `Time`. Both the original call and its expansion have type `Claim`.

The reduction is complete because `DIE`, `SOMEONE`, `BEFORE`, and `NOW` are declared primitives. The result expresses Alice's death occurring in the past. Neither type checking nor reduction proves that Alice died.

## 6. Truth assessment

After reduction, assess whether the reduced claim is valid, invalid, or undefined. The assessment procedure and the information it requires remain to be specified.
