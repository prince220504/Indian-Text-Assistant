# 23 — Correct but wrong: the greeting node and the New chat button

**Day 22 · Week 5 D3 · branch `feature/ux-polish`**

Day 21 shipped two screens. Nothing was broken. Everything passed.

Then you typed `hii` into your own app and it said:

> I don't have enough information in my documents to answer that.

No line of code was wrong. That's what makes today's bug interesting.

---

## 1. "Correct but wrong"

Trace `hii` through the graph as it stood yesterday:

| Desk | What it did | Wrong? |
|---|---|---|
| `route_node` | No "GST"/"Income-Tax"/"TDS" in the reply → `for/else` → `General` | No. It genuinely isn't any of those. |
| `decide_after_route` | Not GST → `generate` | No. There are no documents for General. |
| `generate_node` | `documents == []` → return `REFUSAL` | No. That's exactly the Day 11 rule. |

Every function behaved as designed. The **composition** is what's wrong.

> ⭐ **Interview tip.** This is the answer to *"tell me about a bug that wasn't a bug."*
> Tests pass, types check, every unit is sound, and the product is still wrong. You cannot
> find this class of bug by reading a function — only by using the thing. Day 19's citation
> bug was found the same way: by looking at the screen, not the code.

The deeper point: **tests encode what you thought of.** Nobody writes
`assert greeting_is_friendly`. Your 27 asserts were all green while the front door of the
product insulted every new user.

---

## 2. Where the fix goes — and where it does *not*

The tempting one-liner: inside `generate_node`, if the question looks like a greeting,
return something friendly.

Two reasons not to.

**One: that node already has two jobs.** Write a cited answer, and refuse. A third `if`
makes it a node with three behaviours, and nodes that grow a third `if` grow a fourth.

**Two — the real reason: the decision was already made upstream.** `route_node`'s *entire
job* is answering "what kind of question is this?". A greeting is a kind of question.
Classifying it anywhere else means two places decide the same thing.

> ⭐ **Put a decision at the desk that owns decisions.**
> The router grows a category; nothing downstream grows an `if`.

Same instinct as Day 21's `NavLink`: the router already knows which tab is active, so you
never copy that into a `useState`. Two sources of truth drift. Always.

So the new shape:

```
route → "Greeting" → greet_node (canned string) → END
```

---

## 3. A node that never calls the model

```python
def greet_node(state: GraphState):
    """Desk 0.5: not a question. Hand back the canned hello and leave."""
    return {"answer": GREETING}
```

No `llm.invoke`. **The reply doesn't depend on the input**, so there is nothing to ask the
model about. Same instinct as Day 11's refusal shortcut: when the answer is already known,
don't pay for a call to discover it.

Watch the trace — the whole greeting path is one LLM call, the routing one:

```
[route] Greeting
GREETING:
Hello! I'm a tax assistant for Indian freelancers...
SOURCES: []
```

And notice what you *didn't* write: `sources` is `[]`, and no line in `greet_node` produced
that. `ask()` seeds `documents: []`, `greet_node` never touches the key, so
`unique_sources([])` returns `[]` and the greeting shows no source pills.

> ⭐ Seeding state properly on Day 14 is why today's node is three lines long.

---

## 4. Four things a LangGraph node needs

Miss one, get a different failure each time:

| # | Line | What breaks without it |
|---|---|---|
| 1 | `def greet_node(...)` | nothing to run |
| 2 | `workflow.add_node("greet", greet_node)` | unknown node at compile |
| 3 | `decide_after_route` returns `"greet"` | branch never taken |
| 4 | `{"greet": "greet"}` in the conditional map | **runtime error** |
| 5 | `workflow.add_edge("greet", END)` | the file never leaves the office |

### `END` is not used up

A common confusion: you already have `generate → END`, so can you add another?

Yes. `END` isn't a node you consume — it's a marker meaning "done". Any number of desks
point at it. Two exits from the same building.

### And order doesn't matter

Everything from `StateGraph(GraphState)` down to `add_edge("greet", END)` is a
**description being written down**, not steps being run. Nothing executes until
`workflow.compile()` reads the finished description.

> ⭐ You're filling in a form, not walking a path. That's why `add_node` and `add_edge`
> can appear in any sequence.

### The map is the one place a string typo throws

`decide_after_route` returning a string that isn't a key in
`{"retrieve": ..., "generate": ..., "greet": ...}` is a **loud runtime error**.

In a project where five bugs have now been silent string typos, this is worth noticing:
the map is doing the job a type system would. LangGraph made you declare your destinations,
so it can check them.

---

## 5. Adding to a substring matcher

`route_node` matches loosely — never `==` a model's output (Day 10):

```python
for name in ("GST", "Income-Tax", "TDS", "Greeting"):
    if name.lower() in raw.lower():
```

Adding a name to a substring matcher is where collisions are born. If two category names
share letters the wrong way, the earlier one in the tuple **silently wins forever** and the
later one becomes unreachable. No error. Ever.

So the check, before typing: is `"gst"` a substring of `"greeting"`?

`g-r-e-e-t-i-n-g` — no `s`. And `in` needs the letters **contiguous and in order**, so even
a string containing g, s and t scattered about wouldn't match: `"gst" in "goods and
services tax"` is `False` too.

> ⭐ Every time you add a name to a substring matcher, re-run the collision check.

Also: `Greeting` goes **above** `General` in the prompt, for the same reason a catch-all
goes last in an `if/elif` chain. `General` is the "anything else" bucket.

---

## 6. Loose match the model, exact match yourself

The new assert breaks a rule you've followed since Day 10 — and that's the point:

```python
assert c["answer"] == GREETING, "greeting must return the canned reply verbatim"
```

`==`. Exact. Every other assert in the project matches loosely:
`"don't have enough information" in b["answer"]`, `verdict.startswith("yes")`,
`name.lower() in raw.lower()`.

The difference: `GREETING` is **your constant, returned by your code**. The model never
touches it. It cannot wobble.

> ⭐ **Loose match what the model wrote; exact match what your code wrote.**
> When a value has wobble in it, `==` is a flaky test. When it can't, `==` is the strongest
> check available, and anything looser is a weaker test for no reason.

27 asserts → **29**.

---

## 7. The line from four days ago that made this work

The self-check calls `ask()` directly. The real app doesn't — it goes
`chat()` → `condense()` → `ask()`. Untested path.

And `condense()` is dangerous here. With history present it rewrites the question using
context. `hii` after a GST answer could plausibly become
*"What is the GST registration threshold for services?"* — and the router would never see a
greeting at all.

It doesn't, because of the first rule in `CONDENSE_PROMPT`, added on Day 18 for a completely
different reason:

> greeting / not-a-question → pass through unchanged

> ⭐ A defensive rule written for one reason pays out for another. Today's feature works on
> the history path because of a line typed four days ago.

Which is also why the live test mattered: **two paths, two tests.** Greeting with empty
history (condense early-returns), and greeting *after* a real answer (condense runs).

---

## 8. New chat = a new key, not a delete

Second half of the day, frontend.

The tempting model: a button that deletes the messages. Wrong — your messages don't live in
React. Postgres is the source of truth; React is a mirror. Clearing the mirror does nothing,
refresh and they're back.

The real move: **stop using this session id and start a new one.**

```jsx
function newChat() {
  const fresh = crypto.randomUUID();
  localStorage.setItem("sessionId", fresh);
  setSessionId(fresh);
  setMessages([]);
}
```

> ⭐ **Don't delete data you can simply stop pointing at.** No `DELETE` endpoint, no confirm
> dialog, no cascade. A new key is one line and does the whole job.

The old rows stay in Postgres, keyed by an id nobody holds. Unreachable, harmless — and if a
"past conversations" list ever ships, they become a *feature*. Deleting them today would
have destroyed that.

### Three changes, three different gaps

| Change | Without it |
|---|---|
| `localStorage.setItem` | refresh puts you back in the old chat |
| `setSessionId(fresh)` | next message posts to the **old** session — merged conversations |
| `setMessages([])` | the screen still shows the old chat |

That third one surprises people. The id changed — why doesn't the history effect refetch?
Because its deps are `[]`: **run once, on mount, forever.** It doesn't watch `sessionId`.
So you clear the screen by hand.

And Day 17's line had to grow a setter:

```jsx
const [sessionId, setSessionId] = useState(() => { ... });   // was: const [sessionId]
```

The id was born once and never changed. "New chat" is precisely the feature that changes it.

### One refresh tests two of the three

Click New chat → ask a question → **refresh**. If the old conversation returns,
`localStorage` didn't update. If the new answer is missing, `setSessionId` didn't. Clicking
the button alone only proves `setMessages([])`.

---

## 9. Bug of the day: `onclick`

```jsx
onclick={newChat}     // typed
onClick={newChat}     // React
```

Button rendered. Click did nothing.

`onclick` is the **HTML** attribute name. React uses camelCase for every event prop — which
is why `onSubmit` and `onChange` elsewhere in the same file work fine. React doesn't
recognise `onclick`, passes it to the DOM as an unknown attribute, and never attaches a
listener.

Fifth string-typo bug in this project, and the family trait holds: **JSX prop names are
strings to React, not identifiers.** `newChat` was spelled correctly, so nothing was
`undefined`, so nothing threw. Only the *key* was wrong.

> ⭐ **If it's silent, look at a string.** Compare the broken line against a working sibling
> in the same file — `onSubmit` and `onChange` were three lines away, both correct.

(React does print a console warning for this specific one. That only helps if the console is
open — which is why "console open first" is the debug order, not the debug afterthought.)

---

## 10. Two smaller lessons

**Comments describing control flow go stale the moment you add a branch.** The comment above
`decide_after_route` described two outcomes; there are now three, and it described the
greeting branch *wrongly*. Second sighting after Day 20's `/calculator` vs `/calculate`.
Wrong comments read as confidently as right ones.

And when a comment needs a new case, **rewrite the sentence, don't wedge a clause into the
middle of it** — that produces exactly the same tangle as patching code that way.

**Read the exception's own words before the stack trace.** The backend died mid-session with
thirty lines of uvicorn and importlib frames, and the entire story was the last line:

```
could not translate host name "ep-...aws.neon.tech" to address: Name or service not known
```

That's **DNS** — not credentials, not SQL, not code. `nslookup` proved it: the first attempt
had no working DNS server (`127.0.0.1`, "Default servers are not available"), the second
resolved instantly. Neon was never down. Compare with what other failures say:
`password authentication failed` (auth), `connection timed out` (unreachable host).

---

## 11. The door that only opens one way

There is now no way to see an old conversation. The rows exist; nothing knows the id.

That's not an oversight — it's the shape of a missing feature, and it's worth naming
precisely, because **the reason it's missing is a debt you took on earlier.**

**Option A — server-side list.** `GET /sessions`, distinct `session_id`s with each first
question. **Cannot be built safely today.** There's no `user_id` on `messages`, so "list the
sessions" means listing *every user's* sessions. That endpoint is a data leak, not a feature.

> ⭐ This is what security debt actually costs. It doesn't hurt when you take it on. It
> blocks the *next* feature.

**Option B — client-side list.** Keep an array of ids in `localStorage` instead of a single
one; render a sidebar. No backend change, no leak, works today. Ceiling: per-browser only.

Deferred deliberately to the logins day, when A becomes buildable and B's ceiling stops
mattering.

---

## Flashcards

**Q. What is a "correct but wrong" bug?**
Every function behaves as designed; the composition produces a bad experience. Not findable
by reading code — only by using the product.

**Q. Why did the greeting go in the router, not in `generate_node`?**
The router's job *is* classification, and the classification already happened there. Putting
it downstream means two places decide one thing.

**Q. Why does `greet_node` make no LLM call?**
The reply doesn't depend on the input. Nothing to ask.

**Q. Why does the greeting show no source pills, with no code for it?**
`ask()` seeds `documents: []`; `greet_node` never touches that key; `unique_sources([])` is `[]`.

**Q. Can two nodes both edge to `END`?**
Yes. `END` is a marker, not a consumable node.

**Q. Does the order of `add_node` / `add_edge` calls matter?**
No. It's a description, compiled later.

**Q. When is `==` the right assert, given "never `==` a model's output"?**
When the value came from your own code and cannot wobble. Loose match the model; exact match
yourself.

**Q. Why is "New chat" a new key rather than a delete?**
Postgres is the source of truth. A new id makes the old rows unreachable — one line, no
endpoint, and reversible if a history sidebar ever ships.

**Q. Why is `setMessages([])` needed if `sessionId` changed?**
The history effect's deps are `[]` — it runs once on mount and doesn't watch `sessionId`.

**Q. Why did `onclick` fail silently?**
JSX prop names are strings to React. The handler was defined; only the key was misspelled,
so nothing was `undefined` and nothing threw.

---

## Self-test

1. Add a `Hindi` category to `route_node`. Which two things must you check before typing it?
2. Someone moves the greeting check from `route_node` into `generate_node`. Name one bug that
   becomes possible that isn't possible today.
3. `decide_after_route` returns `"greeting"` instead of `"greet"`. Loud or silent? Why?
4. You delete `setMessages([])` from `newChat`. Describe exactly what the user sees.
5. Why does `GET /sessions` leak data, and what single column fixes it?

---

**Files touched:** `backend/rag/generator.py` (+`GREETING`), `backend/rag/graph.py`
(`greet_node`, route category, edges, 2 asserts), `frontend/src/pages/Chat.jsx`
(`newChat`, header row).
**Asserts:** 27 → 29. **Bugs:** 4 typed (3 spelling in a user-facing string, 1 `onclick`),
1 silent-ish. **Next:** conversations sidebar, after logins.
