"""Small constructors for the 14 post types, so chapters read like content rather than JSON."""


def _p(type_, t, take=None, **fields):
    d = {"type": type_, "t": t}
    if take:
        d["take"] = take
    d.update({k: v for k, v in fields.items() if v is not None})
    return d


def hook(t, kicker, head, sub, art, artText=None, take=None):
    return _p("hook", t, take, kicker=kicker, head=head, sub=sub, art=art, artText=artText)


def scene(t, label, text, h=None, foot=None, extra=None, theme="paper", take=None):
    return _p("scene", t, take, label=label, h=h, text=text, foot=foot, extra=extra, theme=theme)


def chat(t, label, *msgs, take=None):
    return _p("chat", t, take, label=label, msgs=[{"who": w, "text": x} for w, x in msgs])


def character(t, char_id):
    return _p("character", t, None, charId=char_id)


def twist(t, head, text, status, take=None):
    return _p("twist", t, take, head=head, text=text, status=status)


def opt(text, feedback):
    return {"text": text, "feedback": feedback}


def poll(t, label, q, options, reveal, hint="Pick one to see what actually happened.", take=None):
    return _p("poll", t, take, label=label, q=q, options=options, reveal=reveal, hint=hint)


def guess(t, label, q, options, reveal, loop_id, hint="Pick your answer. We’ll keep it for later.", reveal_label=None, take=None):
    return _p("guess", t, take, label=label, q=q, options=options, reveal=reveal, hint=hint, loopId=loop_id, revealLabel=reveal_label)


def crossoff(t, title, items, answer, note="", take=None):
    return _p("crossoff", t, take, title=title, items=[{"text": a, "why": b} for a, b in items], answer=answer, note=note or None)


def myth(t, myth_text, truth, take=None):
    return _p("myth", t, take, myth=myth_text, truth=truth)


def idea(t, label, head, sub, visual=None, payoff=None, theme="sodium", take=None):
    return _p("idea", t, take, label=label, head=head, sub=sub, visual=visual, payoffLoopId=payoff, theme=theme)


def checklist(t, label, h, items, text="", theme="paper", take=None):
    """items: list of (state, text) with state in ok | warn | no."""
    return _p("list", t, take, label=label, h=h, items=[{"text": x, "state": s} for s, x in items], text=text or None, style="check", theme=theme)


def receipt(t, label, h, items, total, text="", theme="steel", take=None):
    """items: list of (text, value)."""
    return _p("list", t, take, label=label, h=h, items=[{"text": x, "value": v} for x, v in items], total=total, text=text or None, style="receipt", theme=theme)


def compare(t, label, h, left_title, left, right_title, right, text, mid="?", take=None):
    return _p("compare", t, take, label=label, h=h, leftTitle=left_title, left=left, rightTitle=right_title, right=right, text=text, mid=mid)


def ticket(t, label, number, badge, route, text, foot=None, take=None):
    """route: list of (text, state[, note]) with state in ok | wait | stop."""
    steps = []
    for r in route:
        s = {"text": r[0], "state": r[1]}
        if len(r) > 2:
            s["note"] = r[2]
        steps.append(s)
    return _p("artifact", t, take, template="ticket", label=label, number=number, badge=badge, route=steps, text=text, foot=foot)


def cliff(t, text):
    return _p("cliffhanger", t, None, text=text)


def chapter(n, title, hook_line, recap, posts):
    return {"n": n, "title": title, "hook": hook_line, "recap": recap, "posts": posts}
