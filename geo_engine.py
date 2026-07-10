try:
    import pygame
except Exception:  # pragma: no cover - provide a lightweight stub for editors/linters
    # Minimal pygame stub so static analysis / editors don't flag missing import.
    import types

    def _noop(*a, **k):
        return None

    _draw = types.SimpleNamespace(circle=_noop, line=_noop)
    _time = types.SimpleNamespace(Clock=lambda: types.SimpleNamespace(tick=_noop))
    _event = types.SimpleNamespace(get=lambda: [])
    _display = types.SimpleNamespace(flip=_noop)

    pygame = types.SimpleNamespace(
        draw=_draw,
        time=_time,
        event=_event,
        display=_display,
        QUIT=0,
    )

class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

        self.selected = False
        self.hovered = False

        self.radius = 6
        self.color = "black"

    def move(self, x, y):
        self.x = x
        self.y = y


class Line:
    def __init__(self, start, end):
        self.start = start
        self.end = end

        self.selected = False
        self.hovered = False

        self.color = "black"

    def move(self, dx, dy):
        self.start.x += dx
        self.start.y += dy
        self.end.x += dx
        self.end.y += dy


class Circle:
    def __init__(self, center, radius):
        self.center = center
        self.radius = radius

        self.selected = False
        self.hovered = False

    def move(self, dx, dy):
        self.center.x += dx
        self.center.y += dy


class Rectangle:
    def __init__(self, x, y, width, height):
        self.x = x
        self.y = y

        self.width = width
        self.height = height

        self.selected = False
        self.hovered = False

    def move(self, dx, dy):
        self.x += dx
        self.y += dy


class Triangle:
    def __init__(self, a, b, c):
        self.a = a
        self.b = b
        self.c = c

        self.selected = False
        self.hovered = False

    def move(self, dx, dy):
        self.a.x += dx
        self.a.y += dy
        self.b.x += dx
        self.b.y += dy
        self.c.x += dx
        self.c.y += dy


class Polygon:
    def __init__(self, points):
        # points is expected to be a list of Point instances
        self.points = list(points)

        self.selected = False
        self.hovered = False

    def move(self, dx, dy):
        for point in self.points:
            point.x += dx
            point.y += dy


class Scene:
    def __init__(self):
        self.objects = []

    def add(self, obj):
        self.objects.append(obj)


scene = Scene()

p1 = Point(100, 100)
p2 = Point(300,200)

line = Line(p1, p2)
circle = Circle(p1, 50)

scene.add(p1)
scene.add(p2)
scene.add(line)
scene.add(circle)

class Camera:
    def __init__(self):
        self.offset_x = 0
        self.offset_y = 0
        self.zoom = 1.0
    def world_to_screen(self, x, y):
        screen_x = (x + self.offset_x) * self.zoom
        screen_y = (y + self.offset_y) * self.zoom
        return screen_x, screen_y

class Renderer:
    def draw_point(self, screen, point, camera):
        x, y = camera.world_to_screen(point.x, point.y)
        color = "red" if point.selected else "blue"
        pygame.draw.circle(screen, color, (x,y), point.radius)
    def draw_line(self, screen, line, camera):
        x1, y1 = camera.world_to_screen(line.start.x, line.start.y)
        x2, y2 = camera.world_to_screen(line.end.x, line.end.y)
        pygame.draw.line(screen, "black", (x1, y1), (x2, y2), 2)

clock = pygame.time.Clock()

camera = Camera()
renderer = Renderer()

running = True

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

        screen.fill("white")

        pygame.draw.circle(screen, circle.color, (circle.center.x, circle.center.y), circle.radius)
        pygame.draw.line(screen, line.color, (line.start.x, line.start.y), (line.end.x, line.end.y), 2)
        pygame.draw.circle(screen, p1.color, (p1.x, p1.y), p1.radius)
        pygame.draw.circle(screen, p2.color, (p2.x, p2.y), p2.radius)

        for point in scene.points:
                renderer.draw_point(screen, point, camera)
        for line in scene.lines:
                renderer.draw_line(screen, line, camera)
        pygame.display.flip()

        clock.tick(60)

pygame.quit()
