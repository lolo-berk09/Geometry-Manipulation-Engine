class Scene:
    def __init__(self):
        self.points = []
        self.lines = []
        self.circles = []
        self.rectangles = []
        self.triangles = []
        self.polygons = []
    
class Circle:
    def __init__(self, center, radius):
        self.center = center = (center[0], center[1])
        self.radius = radius
        self.color = "green"
        self.hover_color = "lightgreen"
        self.selected = False

    def update_color(self):
        if self.selected:
            self.color = "darkgreen"
        else:
            self.color = "green"

class Rectangle:
    def __init__(self, top_left, width, height):
        self.top_left = top_left = (top_left[0], top_left[1])
        self.width = width
        self.height = height
        self.selected = False
        self.color = "orange"
        self.hover_color = "lightorange"

    def update_color(self):
        if self.selected:
            self.color = "darkorange"
        else:
            self.color = "orange"

class Triangle:
    def __init__(self, point1, point2, point3):
        self.point1 = point1 = (point1[0], point1[1])
        self.point2 = point2 = (point2[0], point2[1])
        self.point3 = point3 = (point3[0], point3[1])
        self.selected = False
        self.color = "purple"
        self.hover_color = "lightpurple"

    def update_color(self):
        if self.selected:
            self.color = "darkpurple"
        else:
            self.color = "purple"

class Polygon:
    def __init__(self, points):
        self.points = points
        self.selected = False
        self.color = "yellow"
        self.hover_color = "lightyellow"

    def update_color(self):
        if self.selected:
            self.color = "darkyellow"
        else:
            self.color = "yellow"

class Line:
    def __init__(self, start_point, end_point):
        self.start_point = start_point = (start_point[0], start_point[1])
        self.end_point = end_point = (end_point[0], end_point[1])
        self.color = "black"
        self.hover_color = "gray"
        self.selected = False

    def update_color(self):
        if self.selected:
            self.color = "darkgray"
        else:
            self.color = "black"


