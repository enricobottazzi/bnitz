# bnitz: minimal reduction demo

The prototype takes a sentence, expresses it using concepts from a supplied library, and applies rewrite rules until only primitives remain.

## 1. Concept calls

Each concept has a name and inputs. Calls use ordinary function notation:

```text
SOMEONE("Alice")
BEFORE(NOW())
DIED(SOMEONE("Alice"))
```

Calls can represent people, times, or claims. The last call expresses “Alice died.” Expressing a claim does not establish its truth.

## 2. Primitives

Primitives are the agreed stopping points for reduction. A maximum of 64 primitives are allowed.

| Concept call | Meaning |
| --- | --- |
| `SOMEONE("name")` | The person named in the sentence; their identity may remain unresolved. |
| `NOW()` | The present moment in the sentence's context. |
| `BEFORE(time)` | The period before the supplied time. |
| `DIE(person, time)` | The person dies at the supplied time |
| `AND(left, right)` | Both claims hold. |
| `NOT(claim)` | Negates the claim. |

## 3. Rewrite rules

A derived concept is defined by rewrite rules using simpler concepts:

```text
DIED(person)
    → DIE(person, BEFORE(NOW()))
```

The reducer applies the stored rules and records every step.

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

Each concept (primitive or derived) declares a signature:

```text
SOMEONE(name: Text) → Person
NOW() → Time
BEFORE(time: Time) → Time
DIE(person: Person, time: Time) → Claim
DIED(person: Person) → Claim
AND(left: Claim, right: Claim) → Claim
NOT(claim: Claim) → Claim
```

The checker looks up the signature, checks the number of arguments, recursively determines each argument's type, and compares it with the required type. The call's result type comes from its signature, not its name. Thus `NOW()` and `BEFORE(...)` both provide `Time` values.

For example, `DIE(NOW(), SOMEONE("Alice"))` fails at argument 1: expected `Person`, received `Time`.

In a rewrite definition, the inputs take their types from the concept's signature. Check that the replacement has the same result type as the original call.

## 5. Reduction

**The expression representing the whole input sentence must have type `Claim` before reduction and after every rewrite.**

An LLM proposes a translation of the sentence into concept calls from the library. Before rewriting, recursively check the calls and their arguments against their signatures and confirm that the whole expression has type `Claim`. Apply one matching rewrite rule, check that the replacement preserves the replaced expression's type, and check that the updated whole expression still has type `Claim` before continuing. Nested calls retain their own types, such as `Person` or `Time`. Reduction is complete when all concept calls, at every nesting level, refer to declared primitives. No derived or unknown concept calls remain. The output shows the original sentence, its interpretation, the type checks, and each rewrite. Missing definitions, incorrect arguments, type mismatches, or circular rewrites produce `UNDEFINED`, identifying the call and the point where reduction stopped.

For “Alice died”:

```text
DIED(SOMEONE("Alice"))
    → DIE(SOMEONE("Alice"), BEFORE(NOW()))
```

`SOMEONE("Alice")` has type `Person`; `NOW()` and `BEFORE(NOW())` have type `Time`. Both the original call and its expansion have type `Claim`.

The reduction is complete because `DIE`, `SOMEONE`, `BEFORE`, and `NOW` are declared primitives. The result expresses Alice's death occurring in the past. Neither type checking nor reduction proves that Alice died.

For “Alice died but Bob didn't,” the prototype uses `AND` for the truth conditions of “but.” Its additional contrast is not represented yet.

```text
AND(
    DIED(SOMEONE("Alice")),
    NOT(DIED(SOMEONE("Bob")))
)
    →
AND(
    DIE(SOMEONE("Alice"), BEFORE(NOW())),
    NOT(DIED(SOMEONE("Bob")))
)
    →
AND(
    DIE(SOMEONE("Alice"), BEFORE(NOW())),
    NOT(DIE(SOMEONE("Bob"), BEFORE(NOW())))
)
```

Each `DIED` call and its expansion have type `Claim`. `NOT` takes and returns a `Claim`; `AND` combines two claims into a `Claim`. The outer `AND` expression has type `Claim` before and after each rewrite. Both clauses use the same contextual present and its preceding period. Negation applies to the whole claim that Bob died during that period.

## 6. Truth assessment

Assess the reduced claim using logical rules and supplied facts. Return `VALID` when established, `INVALID` when its negation is established, or `UNDEFINED` when evidence is missing or conflicting. Include the reasoning and identify any unresolved or conflicting conditions; missing facts do not imply falsity.

For “Alice died but Bob didn't,” suppose supplied facts establish Alice died before now and Bob did not:

```text
AND(
    DIE(SOMEONE("Alice"), BEFORE(NOW())),
    NOT(DIE(SOMEONE("Bob"), BEFORE(NOW())))
)

Assessment: AND(TRUE, NOT(FALSE)) → TRUE
Result: VALID
```

Keeping Alice's fact fixed: if Bob also died, the result is `INVALID`; if Bob's history is unknown, it is `UNDEFINED` at `DIE(SOMEONE("Bob"), BEFORE(NOW()))`.

For “Alice died and Alice did not die”:

```text
AND(
    DIE(SOMEONE("Alice"), BEFORE(NOW())),
    NOT(DIE(SOMEONE("Alice"), BEFORE(NOW())))
)

Assessment: a claim and its exact negation cannot both hold.
Result: INVALID
```

Both parts concern the same person and period. No external facts are needed to establish this contradiction.

## 7. Truth generation

Produce new truth, combinatorially, using core primitives, logical reasoning and externally supplied facts.

## 8. Future applications

- **Bullshit filter/detector:** Reduce statements to explicit claims to help expose vague language, empty jargon, and contradictions. Show what a statement commits to and what remains undefined or unsupported. Related discussion: [AI bullshit detector on Reddit](https://www.reddit.com/r/ArtificialInteligence/comments/1to4evf/heres_an_ai_bullshit_detector_i_use_it_daily_and/).
