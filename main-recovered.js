const canvas = document.getElementById("canvas");
const gridLines = document.getElementById("grid-lines");
const axes = document.getElementById("axes");
const shapes = document.getElementById("shapes");
const labels = document.getElementById("labels");
const status = document.getElementById("status");

const toolButtons = document.querySelectorAll("[data-tool]");

// Coordinate system settings
const SCALE = 40; // pixels per mathematical unit

let currentTool = "select"; 

//ID of currently selected geometry object
let selectedObjectId = null;
let firstLinePointId = null;
let firstCirclePointId = null;
let firstTrianglePointIds = [];
let firstRectanglePointIds = [];

// Central storage for all geometry objects
const geometryObjects = [];

// Gives each new object an ID
let nextObjectId = 1;

// Create an SVG element with the given attributes
function createSVGElement(name, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    return element;
}

// Convert screen pixels into mathematical coordinates
function screenToMath(screenX, screenY) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    return {
        x: (screenX - width / 2) / SCALE,
        y: (height / 2 - screenY) / SCALE
    };
}

    // Convert mathematical coordinates into screen pixels
    function mathToScreen(x, y) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    return {
        x: width / 2 + x * SCALE,
        y: height / 2 - y * SCALE
    };
}

/**
 * Calculate distance between points
 */
function calculateDistance(pointA, pointB) {
    const dx = pointB.coordinates.x - pointA.coordinates.x;
    const dy = pointB.coordinates.y - pointA.coordinates.y;

    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the slope between the two points.
 */
function calculateSlope(pointA, pointB) {
    const dx = pointB.coordinates.x - pointA.coordinates.x;
    const dy = pointB.coordinates.y - pointA.coordinates.y;

    //verticle lines have undefined slope
    if (dx === 0) {
        return null;
    }
    return dy / dx;
}

/**
 * Check whether 4 points form a rectangle
 */
function isValidRectangle(points) {
    if (points.length !== 4 || points.some((point) => !point)) {
        return false;
    }

    const [A, B, C, D] = points;

    //calculate the side vectors
    const AB = {
        x: B.coordinates.x - A.coordinates.x,
        y: B.coordinates.y - A.coordinates.y
    };

    const BC = {
        x: C.coordinates.x - B.coordinates.x,
        y: C.coordinates.y - B.coordinates.y
    };

    const CD = {
        x: D.coordinates.x - C.coordinates.x,
        y: D.coordinates.y - C.coordinates.y
    };

    const DA = {
        x: A.coordinates.x - D.coordinates.x,
        y: A.coordinates.y - D.coordinates.y
    };

    const length = (v) => Math.hypot(v.x, v.y);
    const dot = (u, v) => u.x * v.x + u.y * v.y;
    const cross = (u, v) => u.x * v.y - u.y * v.x;

    const lengths = [length(AB), length(BC), length(CD), length(DA)];

    // reject sides with 0 length
    if (lengths.some((side) => side < 0.000001)) {
        return false;
    }

    const tolerance = 0.0001;

    // opposite sides must be parallel and divide their lengths so the test is scale-dependent
    const parallelAB_CD =
    Math.abs(cross(AB, CD)) / (length(AB) * length(DA));

    const parallelBC_DA =
    Math.abs(cross(BC, DA)) / (length(BC) * length(DA));

    if (
        parallelAB_CD > tolerance ||
        parallelBC_DA > tolerance
    ) {
        return false;
    }

    //adjacent sides must be perpendicular and normalize the dot product to make tolerance reliable
    if (
        Math.abs(dot(AB, BC)) / (length(AB) * length(BC)) > tolerance ||
        Math.abs(dot(BC, CD)) / (length(BC) * length(CD)) > tolerance ||
        Math.abs(dot(CD, DA)) / (length(CD) * length(DA)) > tolerance ||
        Math.abs(dot(DA, AB)) / (length(DA) * length(AB)) > tolerance
    ) {
        return false;
    }

    return true;
}
 
//Draw the grid, axes, and numbered labels on the plane.
function drawCoordinatePlane() {
    gridLines.replaceChildren();
    axes.replaceChildren();
    labels.replaceChildren();

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (width === 0 || height === 0) {
        return; 
    }

    const centerX = width / 2;
    const centerY = height / 2;

    // Determine the number of grid lines to draw based on the canvas size and scale
    const unitsAcross = Math.ceil(width / SCALE);
    const unitsDown = Math.ceil(height / SCALE);

    // Draw vertical grid lines
    for (let i = -unitsAcross; i <= unitsAcross; i++) {
        const x = centerX + i * SCALE;

        gridLines.appendChild(
            createSVGElement("line", {
                x1: x,
                y1: 0,
                x2: x,
                y2: height,
                class: "grid-lines"
            })
        );
    }

    // Draw horizontal grid lines
    for (let i = -unitsDown; i <= unitsDown; i++) {
        const y = centerY + i * SCALE;

        gridLines.appendChild(
            createSVGElement("line", {
                x1: 0,
                y1: y,
                x2: width,
                y2: y,
                class: "grid-lines"
            })
        );
    }

    // Draw the x-axis
    axes.appendChild(
        createSVGElement("line", {
            x1: 0,
            y1: centerY,
            x2: width,
            y2: centerY,
            class: "axis-line"
        })
    );

    // Draw the y-axis
    axes.appendChild(
        createSVGElement("line", {
            x1: centerX,
            y1: 0,
            x2: centerX,
            y2: height,
            class: "axis-line"
        })
    );

    // Label the horizontal axis (x-axis)
    for (let i = -unitsAcross; i <= unitsAcross; i++) {
        if (i === 0) continue;

        const x = centerX + i * SCALE;

        if (x < 12 || x > width - 12) continue;

        labels.appendChild(
            createSVGElement("text", {
                x: x,
                y: centerY + 16,
                "text-anchor": "middle",
                class: "axis-label",
            })
        ).textContent = i;
    }

    // Label the vertical axis (y-axis)
    for (let i = -unitsDown; i <= unitsDown; i++) {
        if (i === 0) continue;

        const y = centerY - i * SCALE;

        if (y < 12 || y > height - 12) continue;

        labels.appendChild(
            createSVGElement("text", {
                x: centerX + 8,
                y: y - 5,
                "text-anchor": "start",
                class: "axis-label",
            })
        ).textContent = i;
    }

    // Mark the origin
    labels.appendChild(
        createSVGElement("text", {
            x: centerX + 8,
            y: centerY + 16,
            class: "axis-label",
        })
    ).textContent = "0";

    // Redraw shapes after the coordinate plane is drawn
    renderPoints();
}

// Redraw all shapes on the canvas using their mathematical coordinates
function renderPoints() {
    // clear drawing layer before redrawing
    shapes.replaceChildren();

    // draw lines (first so points on top)
    geometryObjects.forEach((object) => {
        if (object.type !== "line") return;

        const pointA = geometryObjects.find(
            (item) => item.id === object.pointAId
        );

        const pointB = geometryObjects.find(
            (item) => item.id === object.pointBId
        );

        // skip line if endpoints aren't found
        if (!pointA || !pointB) return;

        const screenA = mathToScreen(
            pointA.coordinates.x,
            pointA.coordinates.y
        );

        const screenB = mathToScreen(
            pointB.coordinates.x,
            pointB.coordinates.y
        );

        const line = createSVGElement("line", {
            x1: screenA.x,
            y1: screenA.y,
            x2: screenB.x,
            y2: screenB.y,
            stroke: "#f59e0b",
            "stroke-width": 3,
            "stroke-linecap": "round",
            "pointer-events": "none"
        });

        shapes.appendChild(line);
    });

    //draw circles before points
    geometryObjects.forEach((object) => {
        if (object.type !== "circle") return;

        const centerPoint = geometryObjects.find(
            (item) => item.id === object.centerPointId
        );

        const radiusPoint = geometryObjects.find(
            (item) => item.id === object.radiusPointId
        );

        //skip circle if either point is missing
        if (!centerPoint || !radiusPoint) return;

        const centerScreen = mathToScreen(
            centerPoint.coordinates.x,
            centerPoint.coordinates.y
        );

        const radius = calculateDistance(centerPoint, radiusPoint);

        // convert radius into screen pixels
        const radiusPixels = radius * SCALE;

        const circle = createSVGElement("circle", {
            cx: centerScreen.x,
            cy: centerScreen.y,
            r: radiusPixels,
            fill: "rgba(96, 165, 250, 0.08)",
            stroke: "#60a5fa",
            "stroke-width": 2,
            "pointer-events": "none"
        });
        shapes.appendChild(circle);
    });

    // Draw triangles before points
    geometryObjects.forEach((object) => {
        if (object.type !== "triangle") return;

        const trianglePoints = object.pointIds.map((pointId) =>
        geometryObjects.find((item) => item.id === pointId)
    );

    //Skip triangles with missing vertices
    if (trianglePoints.some((point) => !point)) return;

    const screenPoints = trianglePoints.map((point) =>
    mathToScreen(
        point.coordinates.x,
        point.coordinates.y
    )
 );

 const pointsAttribute = screenPoints
 .map((point) => `${point.x}, ${point.y}`)
 .join(" ");

 const triangle = createSVGElement("polygon", {
    points: pointsAttribute,
    fill: "rgba(52, 211, 153, 0.12)",
    stroke: "#34d399",
    "stroke-width": 2.5,
    "stroke-linejoin": "round",
    "pointer-events": "none"
 });

 shapes.appendChild(triangle);
});

// draw rectangles before points
geometryObjects.forEach((object) => {
    if (object.type !== "rectangle") return;

    const rectanglePoints = object.pointIds.map((pointId) => 
    geometryObjects.find((item) => item.id === pointId)
);

//skip rectangles with missing points
if (rectanglePoints.some((point) => !point)) return;

const screenPoints = rectanglePoints.map((point) =>
    mathToScreen(
        point.coordinates.x,
        point.coordinates.y
    )
);

const pointsAttribute = screenPoints
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

const rectangle = createSVGElement("polygon", {
    points: pointsAttribute,
    fill: "rgba(167, 139, 250, 0.12)",
    stroke: "#a78bfa",
    "stroke-width": 2.5,
    "stroke-linejoin": "round",
    "pointer-events": "none"
});

shapes.appendChild(rectangle);
});

// draw points on top of lines and shapes
geometryObjects.forEach((object) => {
    if (object.type !== "point") return;

    const x = object.coordinates.x;
    const y = object.coordinates.y;
    const screen = mathToScreen(x, y);
    const isSelected = object.id === selectedObjectId;

    const point = createSVGElement("circle", {
        cx: screen.x,
        cy: screen.y,
        r: isSelected ? 8 : 5,
        fill: isSelected ? "#f59e0b" : "#60a5fa",
        stroke: "#ffffff",
        "stroke-width": isSelected ? 2.5 : 1.5,
        "data-object-id": object.id,
        class: "geometry-point"
    });

    shapes.appendChild(point);
});
}

// Change the currently selected tool
function selectTool(tool) {
    currentTool = tool;

    toolButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.tool === tool);
    });
    status.textContent = `Selected tool: ${tool}.`;
}

// Connect the toolbar buttons to the selectTool function
toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
        selectTool(button.dataset.tool);
    });
});

// Handle clicks on the drawing surface
canvas.addEventListener("click", (event) => {
    const bounds = canvas.getBoundingClientRect();

    const screenX = event.clientX - bounds.left;
    const screenY = event.clientY - bounds.top;

    // select tool: existing point
    if (currentTool === "select") {
        const clickedElement = document.elementFromPoint(
            event.clientX,
            event.clientY
        );

        const pointElement = clickedElement?.closest(".geometry-point");

        if (pointElement && shapes.contains(pointElement)) {
            selectedObjectId = pointElement.dataset.objectId;

            const selectedObject = geometryObjects.find(
                (object) => object.id === selectedObjectId
            );

            renderPoints();

            status.textContent =
                `Selected ${selectedObject.id} at (${selectedObject.coordinates.x}, ${selectedObject.coordinates.y}).`;
        } else {
            selectedObjectId = null;
            renderPoints();
            status.textContent = "Nothing selected.";
        }

        return;
    }

    // Point tool: create new point
    if (currentTool === "point") {
        const pointCoordinates = screenToMath(screenX, screenY);

        const x = Math.round(pointCoordinates.x * 100) / 100;
        const y = Math.round(pointCoordinates.y * 100) / 100;

        const pointObject = {
            id: `point-${nextObjectId++}`,
            type: "point",
            coordinates: {
                x: x,
                y: y
            }
        };

        geometryObjects.push(pointObject);
        selectedObjectId = pointObject.id;

        renderPoints();

        status.textContent =
            `Created ${pointObject.id} at (${x}, ${y}).`;

        console.log("Created geometry object:", pointObject);

        return;
    }

    // Line tool: choose two points
    if (currentTool === "line") {
        // Use the actual element that received the click.
        const pointElement = event.target.closest?.(".geometry-point");

        if (!pointElement || !shapes.contains(pointElement)) {
            status.textContent =
                "Click directly on an existing point to create a line.";
            return;
        }

        const clickedPointId = pointElement.getAttribute("data-object-id");

        // First click: remember the starting point.
        if (firstLinePointId === null) {
            firstLinePointId = clickedPointId;

            status.textContent =
                `First point: ${clickedPointId}. Now click the second point.`;

            return;
        }

        // Prevent connecting a point to itself.
        if (clickedPointId === firstLinePointId) {
            status.textContent =
                "Choose a different point for the second endpoint.";
            return;
        }

        // Create the line connecting the two points.
        const lineObject = {
            id: `line-${nextObjectId++}`,
            type: "line",
            pointAId: firstLinePointId,
            pointBId: clickedPointId
        };

        geometryObjects.push(lineObject);

       //Find the two endpoint objects
       const pointA = geometryObjects.find(
        (object) => object.id === lineObject.pointAId
       );

       const pointB = geometryObjects.find(
        (object) => object.id === lineObject.pointBId
       );

       //Calculate the line's measurments
       const length = calculateDistance(pointA, pointB);
       const slope = calculateSlope(pointA, pointB);

       // Reset the starting point for next line
       firstLinePointId = null;

       renderPoints();

       // Format the measurements for display
       const slopeText = slope === null
       ? "undefined (verticle line)"
       : slope.toFixed(2);

       status.textContent = 
        `Created ${lineObject.id} | Length: ${length.toFixed(2)} | Slope: ${slopeText}`;

        console.log("Created geometry object:", lineObject);
        console.log("Line length:", length);
        console.log("Line slope:", slope);

        return;
    }

    // Circle tool: center and radius
    if (currentTool === "circle") {
        const pointElement = event.target.closest?.(".geometry-point");

        if (!pointElement || !shapes.contains(pointElement)) {
            status.textContent = 
                "Click an existing point to define the circle.";
                return;
        }

        const clickedPointId = 
            pointElement.getAttribute("data-object-id");
        
        // first click: choose center
        if (firstCirclePointId === null) {
            firstCirclePointId = clickedPointId;

            status.textContent = 
                `Center selected: ${clickedPointId}. Now click a second point to set the readius.`;

                return;
        }

        // Circles must have a positive radius
        if (clickedPointId === firstCirclePointId) {
            status.textContent = 
            "Choose a different point to define the radius.";
            return;
        }

        //Second click: create circle object
        const circleObject = {
            id: `circle-${nextObjectId++}`,
            type: "circle",
            centerPointId: firstCirclePointId,
            radiusPointId: clickedPointId
        };

        geometryObjects.push(circleObject);

        const centerPoint = geometryObjects.find(
            (object) => object.id === circleObject.centerPointId
        );

        const radiusPoint = geometryObjects.find(
            (object) => object.id === circleObject.radiusPointId
        );

        const radius = calculateDistance(centerPoint, radiusPoint);
        const area = Math.PI * radius * radius;
        const circumference = 2 * Math.PI * radius;

        firstCirclePointId = null;

        renderPoints();

        status.textContent = 
        `Created ${circleObject.id} | Radius: ${radius.toFixed(2)} | Area: ${area.toFixed(2)} 
        | Circumference: ${circumference.toFixed(2)}`;

        console.log("Created geometry object:", circleObject);
        console.log("Circle radius:", radius);
        console.log("Circle area:", area);
        console.log("Circle circumference:", circumference);

        return;
    }

    // Triangle tool: choose 3 points
    if (currentTool === "triangle") {
        const pointElement = event.target.closest?.(".geometry-point");

        if (!pointElement || !shapes.contains(pointElement)) {
            status.textContent = 
            "Click an existing point to create a triangle.";
            return;
        }

        const clickedPointId = 
        pointElement.getAttribute("data-object-id");

        // prevent selecting the same point twice
        if (firstTrianglePointIds.includes(clickedPointId)) {
            status.textContent = 
            "Choose a different point for each triangle vertex.";
            return;
        }

        //remember the selected point
        firstTrianglePointIds.push(clickedPointId);

        // tell the user how many are selected so far
        if (firstTrianglePointIds.length < 3) {
            status.textContent = 
            `Selected ${firstTrianglePointIds.lenght} of 3 vertices. Choose the next point.`;

            return;
        }

        // Three points selected, create triangle
        const triangleObject = {
            id: `triangle-${nextObjectId++}`,
            type: "triangle",
            pointIds: [...firstTrianglePointIds]
        };

        // Find 3 point objects
        const trianglePoints = triangleObject.pointIds.map(
            (pointId) =>
                geometryObjects.find((object) => object.id === pointId)
        );

        //Calculate all 3 side lengths
        const sideA = calculateDistance(
            trianglePoints[0],
            trianglePoints[1]
        );

        const sideB = calculateDistance(
            trianglePoints[1],
            trianglePoints[2]
        );

        const sideC = calculateDistance(
            trianglePoints[2],
            trianglePoints[0]
        );

        const perimeter = sideA + sideB + sideC;

        // heron's formula gives area from SSS
        const semiPerimeter = perimeter / 2;

        const area = Math.sqrt(
            semiPerimeter *
            (semiPerimeter-sideA) *
            (semiPerimeter - sideB) *
            (semiPerimeter - sideC)
        );

        // store the triangle and reset selection
        geometryObjects.push(triangleObject);
        firstTrianglePointIds = [];

        renderPoints();

        status.textContent = 
            `Created ${triangleObject.id} | Perimeter: ${perimeter.toFixed(2)} | Area: ${area.toFixed(2)}`;

            console.log("Created triangle:", triangleObject);
            console.log("Side lengths:", sideA, sideB, sideC);
            console.log("Perimeter:", perimeter);
            console.log("Area:", area);

            return;
    }

    // Reactangle tool: choose 4 points in order
    if (currentTool === "rectangle") {
        const pointElement = event.target.closest?.(".geometry-point");

        if (!pointElement || !shapes.contains(pointElement)) {
            status.textContent = 
            "Click an existing point to define the rectangle.";
            return;
        }

        const clickedPointId =
        pointElement.getAttribute("data-object-id");

        // Prevent choosing the same point twice
        if (firstRectanglePointIds.includes(clickedPointId)) {
            status.textContent = 
                "Choose a different point for each rectangle vertice.";
                return;
        }

        firstRectanglePointIds.push(clickedPointId);

        // Wait until all 4 vertices are selected
        if (firstRectanglePointIds.length < 4) {
            status.textContent = 
            `Selected ${firstRectanglePointIds.length} of 4 vertices. Choose the next point.`;
            return;
        }

        // Find the four point objects
        const rectanglePoints = firstRectanglePointIds.map((pointId) =>
        geometryObjects.find((object) => object.id === pointId)
        );

        console.log("Rectangle points selected:",
            rectanglePoints.map((point) => ({
                id: point.id,
                x: point.coordinates.x,
                y: point.coordinates.y
            }))
        );  

        console.log("Rectangle validation result:",
            isValidRectangle(rectanglePoints)
        );

        // Validate before creating the rectangle
        if (!isValidRectangle(rectanglePoints)) {
            firstRectanglePointIds = [];

            status.textContent =
                "Not all points selected yet. Please select 4 vertices again, in order";
                return;
        }

        // Create the rectangle object
        const rectangleObject = {
            id: `rectangle-${nextObjectId++}`,
            type: "rectangle",
            pointIds: [...firstRectanglePointIds]
        };

        const sideA = calculateDistance(rectanglePoints[0], rectanglePoints[1]);
        const sideB = calculateDistance(rectanglePoints[1], rectanglePoints[2]);
        const sideC = calculateDistance(rectanglePoints[2], rectanglePoints[3]);
        const sideD = calculateDistance(rectanglePoints[3], rectanglePoints[0]);

        const perimeter = sideA + sideB + sideC + sideD;
        const area = sideA * sideB;

        geometryObjects.push(rectangleObject);
        firstRectanglePointIds = [];

        renderPoints();

        status.textContent = 
        `Created ${rectangleObject.id} | Area: ${area.toFixed(2)} | Perimeter: ${perimeter.toFixed(2)}`;

        console.log("Created rectangle:", rectangleObject);
        console.log("Side lengths:", sideA, sideB, sideC, sideD);
        console.log("Rectangle area:", area);
        console.log("Rectangle perimeter:", perimeter);

        return;
    }


    // other tools for later
    status.textContent = 
    `Selected tool: ${currentTool}. This tool will be later.`;
});

// Keep the coordinate plane centered in window
window.addEventListener("resize", drawCoordinatePlane);

// Initialize the app
drawCoordinatePlane();

console.log("Geometry Engine initialized with mathematical coordinates.");
