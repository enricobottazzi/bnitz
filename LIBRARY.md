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
| `DIE(person, time)` | The person dies at the supplied moment or sometime within the supplied period. |

`NOW()` retains the sentence's context throughout reduction.

## 3. Rewrite rules

A derived concept is defined by rewrite rules using simpler concepts:

```text
DIED(person)
    → DIED(person, BEFORE(NOW()))

DIED(person, time)
    → DIE(person, time)
```

The first rule supplies the omitted time. The second expands `DIED`. Inputs matched on the left are substituted consistently on the right.

The reducer applies the stored rules and records every step. An LLM does not invent new definitions during reduction.

## 4. Scope

Start with the “Alice died” example and the definitions above. Type checking, precise date forms, and broader language support can come later. The initial translation and the definitions must be reviewed for whether they preserve the intended meaning.

## 5. Reduction

An LLM proposes a translation of the sentence into concept calls from the library. The reducer applies matching rewrite rules, including rules supplying omitted inputs, and repeats until every branch contains only declared primitives and literal data. The output shows the original sentence, its interpretation, and each rewrite. Missing definitions or circular rewrites produce `UNDEFINED`, identifying the call and the point where reduction stopped.

For “Alice died”:

```text
DIED(SOMEONE("Alice"))
    → DIED(SOMEONE("Alice"), BEFORE(NOW()))
    → DIE(SOMEONE("Alice"), BEFORE(NOW()))
```

The reduction is complete because `DIE`, `SOMEONE`, `BEFORE`, and `NOW` are declared primitives. The result expresses Alice's death occurring in the past. It does not prove that Alice died.

## 6. Truth assessment

After reduction, assess whether the reduced claim is valid, invalid, or undefined. The assessment procedure and the information it requires remain to be specified.
