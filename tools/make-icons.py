from PIL import Image, ImageDraw

S = 512
BG = (47, 111, 237, 255)
WHITE = (255, 255, 255, 255)
LINE = (47, 111, 237, 255)


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    rounded(d, (0, 0, S, S), int(S * 0.22), BG)

    pw, ph = int(S * 0.40), int(S * 0.46)
    px = (S - pw) // 2
    py = int(S * 0.12)
    rounded(d, (px, py, px + pw, py + ph), int(S * 0.05), WHITE)

    lx0 = px + int(pw * 0.18)
    lx1 = px + int(pw * 0.82)
    ly = py + int(ph * 0.22)
    for i in range(3):
        d.rounded_rectangle((lx0, ly + i * int(ph * 0.18), lx1, ly + i * int(ph * 0.18) + int(S * 0.035)),
                            radius=int(S * 0.018), fill=LINE)

    cx = S // 2
    shaft_top = int(S * 0.58)
    shaft_bottom = int(S * 0.80)
    d.rounded_rectangle((cx - int(S * 0.035), shaft_top, cx + int(S * 0.035), shaft_bottom),
                        radius=int(S * 0.02), fill=WHITE)
    head = int(S * 0.13)
    d.polygon([(cx - head, shaft_bottom - int(S * 0.02)),
               (cx + head, shaft_bottom - int(S * 0.02)),
               (cx, shaft_bottom + int(S * 0.10))], fill=WHITE)

    return img


def main():
    base = make()
    for size in (16, 48, 128):
        out = base.resize((size, size), Image.LANCZOS)
        out.save(f"icons/icon{size}.png")


if __name__ == "__main__":
    main()
