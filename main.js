const canvas = document.getElementById("canvas");
const gridLines = document.getElementById("grid-lines");
const axes = document.getElementById("axes");
const shapes = document.getElementById("shapes");
const labels = document.getElementById("labels");
const status = document.getElementById("status");

//temporary preview showing where a new point will be placed
let previewPoint = null;

const toolButtons = document.querySelectorAll("[data-tool]");

// Coordinate system settings
const INITIAL_SCALE = 40;
let SCALE = INITIAL_SCALE;
const MIN_SCALE = 10;
const MAX_SCALE = 160;

let currentTool = "select"; 

//ID of currently selected geometry object
let selectedObjectId = null;
let firstLinePointId = null;
let firstCirclePointId = null;
let firstTrianglePointIds = [];
let firstRectanglePointIds = [];
let firstPolygonPointIds = [];

// Central storage for all geometry objects
const geometryObjects = [];

// Gives each new object an ID
let nextObjectId = 1;

let showIntersections = true;

// Create an SVG element with the given attributes
function createSVGElement(name, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    return element;
}

/**
 * Draw a small arc angle using screen coordinates
 */
function createAngleArc(pointA, vertex, pointC, radius = 22) {
    const angleA = Math.atan2(
        pointA.y - vertex.y,
        pointA.x - vertex.x
    );

    const angleC = Math.atan2(
        pointC.y - vertex.y,
        pointC.x - vertex.x
    );

    // find the counterclockwise angle from ray a to c
    let difference = angleC - angleA;

    while (difference < 0) {
        difference += 2 * Math.PI;
    }

    while (difference >= 2 * Math.PI) {
        difference -= 2 * Math.PI;
    }

    // avoid drawing a full circle if the rays overlap
    if (difference < 0.001 || difference > 2 * Math.PI - 0.001) {
        return null;
    } 

    const startX = vertex.x + radius * Math.cos(angleA);
    const startY = vertex.y + radius * Math.sin(angleA);
    const endX = vertex.x + radius * Math.cos(angleC);
    const endY = vertex.y + radius * Math.sin(angleC);

    const largeArcFlag = difference > Math.PI ? 1 : 0;

    // SVG screen coordinates have y increasing downward
    const sweepFlag = 0;

    return createSVGElement("path", {
        d: `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`,
        fill: "none",
        stroke: "#f50bc2",
        "stroke-width": 2,
        "pointer-events": "none",
        class: "angle-arc"
    });
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

function getSnapInterval() {
    const pixelsPerUnit = SCALE;

    if (pixelsPerUnit < 30) {
        return 1;
    } else if (pixelsPerUnit < 60) {
        return 0.5;
    } else if (pixelsPerUnit < 100) {
        return 0.25;
    } else if (pixelsPerUnit < 160) {
        return 0.1;
    } else {
        return 0.05;
    }
}

function snapToGrid(value, interval = getSnapInterval()) {
    return Math.round(value / interval) * interval;
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

function drawPreviewPoint(x, y) {
        // remove the previous preview marker 
        if (previewPoint) {
            previewPoint.remove();
            previewPoint = null;
        }

        // convert the snapped mathematical coordinates to screen pixels
        const screenPosition = mathToScreen(x, y);

        // create a temporary circle at the preview location
        previewPoint = createSVGElement("circle", {
            cx: screenPosition.x,
            cy: screenPosition.y,
            r: 6,
            class: "preview-point"
        });

        // keep the preview separate from saved geometry objects
        canvas.appendChild(previewPoint);
    }

/**
 * Calculate distance between points
 */
function calculateDistance(pointA, pointB) {
    const dx = pointB.coordinates.x - pointA.coordinates.x;
    const dy = pointB.coordinates.y - pointA.coordinates.y;

    return Math.sqrt(dx * dx + dy * dy);
}

// Calculate the perimeter of a shape
function calculatePerimeter(points) {
    let perimeter = 0;

    for (let i = 0; i < points.length; i++) {
        const currentPoint = points[i];
        const nextPoint = points[(i + 1) % points.length];

        perimeter += calculateDistance(currentPoint, nextPoint);
    }

    return perimeter;
}

// calculate the area of a polygon using the shoelace formula
function calculatePolygonArea(points) {
    let sum = 0;

    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];

        sum +=
            current.coordinates.x * next.coordinates.y -
            next.coordinates.x * current.coordinates.y;
    }

    return Math.abs(sum) / 2;
}

// Retrieve the points belonging to a geometry object
function getObjectPoints(object) {
    if (object.type === "point") {
        return [object];
    }

    let pointIds = [];

    if (object.type === "line") {
        pointIds = [object.pointAId, object.pointBId];
    } else if (object.type === "circle") {
        pointIds = [object.centerPointId, object.radiusPointId];
    } else if (Array.isArray(object.pointIds)) {
        pointIds = object.pointIds;
    }

    return pointIds
        .map(id => geometryObjects.find(point => point.id === id))
        .filter(point => point !== undefined);
}

// Display information about the selected geometry object
function updateMathExplorer(object) {
    const welcome = document.getElementById("math-explorer-welcome");
    const details = document.getElementById("math-explorer-details");

    if (!object) {
        welcome.style.display = "block";
        details.innerHTML = "";
        return;
    }

    welcome.style.display = "none";

    const points = getObjectPoints(object);

    // Calculate measurements for selected lines
    let lineMeasurements = "";
    let circleMeasurements = "";
    let triangleMeasurements = "";
    let rectangleMeasurements = "";
    let polygonMeasurements = "";

    // calculate measurements for selected triangles
    if (object.type === "triangle" && points.length === 3) {
        const sideA = calculateDistance(points[0], points[1]);
        const sideB = calculateDistance(points[1], points[2]);
        const sideC = calculateDistance(points[2], points[0]);

        // Calculate the 3 interior angles
        const angleA = calculateAngle(points[1], points[0], points[2]);
        const angleB = calculateAngle(points[0], points[1], points[2]);
        const angleC = calculateAngle(points[0], points[2], points[1]);

        const angleSum = angleA + angleB + angleC;

        console.log("Triangle interior angles:", angleA, angleB, angleC, angleSum);

        const perimeter = calculatePerimeter(points);
        const area = calculatePolygonArea(points);

        // get the coordinates of each triangle vertex
        const x1 = points[0].coordinates.x;
        const y1 = points[0].coordinates.y;

        const x2 = points[1].coordinates.x;
        const y2 = points[1].coordinates.y;

        const x3 = points[2].coordinates.x;
        const y3 = points[2].coordinates.y;

        // calculate the 3 cross-product difference
        const crossProduct1 = (x1 * y2) - (y1 * x2);
        const crossProduct2 = (x2 * y3) - (y2 * x3);
        const crossProduct3 = (x3 * y1) - (y3 * x1);

        // combine the cross-product differences
        const crossProductSum = crossProduct1 + crossProduct2 + crossProduct3;

        // take the absoolute value and divde by 2
        const absoluteCrossProductSum = Math.abs(crossProductSum);
        const shoelaceArea = absoluteCrossProductSum / 2;

        const shoelaceSteps = `
        <h4>Step-by-Step Shoelace Calculation</h4>
        
        <p><strong>Step 1: Identify the vertices.</strong></p>
        <p>Vertex 1: (${x1}, ${y1})</p>
        <p>Vertex 2: (${x2}, ${y2})</p>
        <p>Vertex 3: (${x3}, ${y3})</p>
        
        <p><strong>Step 2: Calculate the cross-product differences.</strong><p/>
        <p>(${x1} × ${y2}) - (${y1} × ${x2}) = ${crossProduct1.toFixed(2)}</p>
        <p>(${x2} × ${y3}) - (${y2} × ${x3}) = ${crossProduct2.toFixed(2)}</p>
        <p>(${x3} × ${y1}) - (${y3} × ${x1}) = ${crossProduct3.toFixed(2)}</p>
        
        <p><strong>Step 3: Add the three results.</strong></p>
        <p>${crossProduct1.toFixed(2)} + ${crossProduct2.toFixed(2)} + ${crossProduct3.toFixed(2)} = ${crossProductSum.toFixed(2)}</p>
        
        <p><strong>Step 4: Take the absolute value and divide by 2.</strong></p>
        <p>|${crossProductSum.toFixed(2)}| ÷ 2 = ${shoelaceArea.toFixed(2)}</p>
        
        <p><strong>Final Area:</strong> ${shoelaceArea.toFixed(2)} square units</p>
        `;

        const triangleAreaExplanation = `
        <h4>Understanding Triangle Area</h4>
        <p>Area measures the amount of space enclosed inside a triangle.</p>
        <p>For this calculation, we use the Shoelace Formula, which uses the coordinates of the triangle's vertices.</p>
        <p><strong>Area:</strong> The absolute value of the sum of the cross-producs, divided by 2.</p>
        <p><strong>When to use it:</strong> Use the Shoelace Formula when you know the coordinates of all 3 vertices of the triangle.</p>
        `;

        const alternativeAreaFormula = `
        <h4>Alternative Formula</h4>
        <p><strong>Heron's Formula</strong><p>
        <p>A = √(s(s - a)(s - b)(s - c))</p>
        <p>where s is the semiperimeter: s = (a + b + c) / 2.</p>
        <p><strong>When to use it:</strong> Use Heron's Formula when you know the lengths of all 3 sides of the triangle.</p>
        `;

        const triangleAngleMeasurements = `
        <h4>Triangle Interior Angles</h4>
        <p><strong>Angle A:</strong> ${angleA.toFixed(2)}°</p>
        <p><strong>Angle B:</strong> ${angleB.toFixed(2)}°</p>
        <p><strong>Angle C:</strong> ${angleC.toFixed(2)}°</p>
        <p><strong>Sum of Angles:</strong> ${angleSum.toFixed(2)}°</p>
        <p>The interior angles of every triangle add up tp 180°.</p>
        `;

        triangleMeasurements = `
            <h4>Triangle Measurements</h4>
            <p><strong>Side A:</strong> ${sideA.toFixed(2)}</p>
            <p><strong>Side B:</strong> ${sideB.toFixed(2)}</p>
            <p><strong>Side C:</strong> ${sideC.toFixed(2)}</p>
            <p><strong>Perimeter:</strong> ${perimeter.toFixed(2)}</p>
            <p><strong>Area:</strong> ${area.toFixed(2)}</p>
            ${triangleAreaExplanation}
            ${alternativeAreaFormula}
            ${shoelaceArea}
            ${triangleAngleMeasurements}
            `;
    }

    // calculate measurements for selected rectangles
    if (object.type === "rectangle" && points.length === 4) {
        const sideA = calculateDistance(points[0], points[1]);
        const sideB = calculateDistance(points[1], points[2]);
        const sideC = calculateDistance(points[2], points[3]);
        const sideD = calculateDistance(points[3], points[0]);

        const perimeter = calculatePerimeter(points);
        const area = calculatePolygonArea(points);

        const rectangleAngleMeasurements = `
        <h4>Rectangle Interior Angles</h4>
        <p><strong>Angle A:</strong> 90°</p>
        <p><strong>Angle B:</strong> 90°</p>
        <p><strong>Angle C:</strong> 90°</p>
        <p><strong>Angle D:</strong> 90°</p>
        <p><strong>Sum of the Angles:</strong> 360°</p>
        <p>Every rectangle has four right angles.</p>
        `;

        rectangleMeasurements = `
        <h4>Rectangle Measurements</h4>
        <p><strong>Side A:</strong> ${sideA.toFixed(2)}</p>
        <p><strong>Side B:</strong> ${sideB.toFixed(2)}</p>
        <p><strong>Side C:</strong> ${sideC.toFixed(2)}</p>
        <p><strong>Side D:</strong> ${sideD.toFixed(2)}</p>
        <p><strong>Perimeter:</strong> ${perimeter.toFixed(2)}</p>
        <p><strong>Area:</strong> ${area.toFixed(2)}</p>
        ${rectangleAngleMeasurements}
        `;
    }

    // calculate measurements for selected polygons
    if (object.type === "polygon" && points.length >= 3) {
        const sideLength = points.map((point, index) => {
            const nextPoint = points[(index + 1) % points.length];

            return calculateDistance(point, nextPoint);
        });

        const perimeter = calculatePerimeter(points);
        const area = calculatePolygonArea(points);

        //calculate each polygon interior angle
        const interiorAngles = points.map((point, index) => {
            const previousPoint = points[(index - 1 + points.length) % points.length];
            const nextPoint = points[(index + 1) % points.length];

            return calculateAngle(previousPoint, point, nextPoint);
        });

        const angleSum = interiorAngles.reduce((sum, angle) => sum + angle, 0);

        const polygonAngleMeasurements = `
        <h4>Polygon Interior Angles</h4>
        ${interiorAngles.map((angle, index) => `
            <p><strong>Angle ${index + 1}:</strong> ${angle.toFixed(2)}°</p>
            `).join("")}
            <p><strong>Sum of Interior Angles:</strong> ${angleSum.toFixed(2)}°</p>
            <p><strong>Interior Angle Sum Formula:</strong> (n - 2) × 180°</p>
            <p>Here, n represents the number of sides (or vertices) of the polygon.</p>
            <p><strong>Substitution:</strong> (${points.length} - 2) × 180° = ${((points.length - 2) * 180).toFixed(2)}°</p>
            `;

        console.log("Polygon interior angles:", interiorAngles);
        console.log("Polygon angle sum:", angleSum);
        console.log("Expected angle sum:", (points.length - 2) * 180);
    
        polygonMeasurements = `
        <h4>Polygon Measurements</h4>
        ${sideLength.map((length, index) => `
            <p><strong>Side ${index + 1}:</strong> ${length.toFixed(2)}</p>
            `).join("")}
            <p><strong>Perimeter:</strong> ${perimeter.toFixed(2)}</p>
            <p><strong>Area:</strong> ${area.toFixed(2)}</p>
            `;
    }

    // calculate measurements for selected circles
    if (object.type === "circle" && points.length === 2) {
        const radius = calculateDistance(points[0], points[1]);
        const diameter = radius * 2;
        const circumference = 2 * Math.PI * radius;
        const area = Math.PI * radius * radius;

        const areaExplanation = `
        <h4>Understanding Circle Area</h4>
        <p>Area measures the amount of space enclosed inside a circle.</p>
        <p><strong>Formula:</strong> A = πr²</p>
        <p><strong>Radius:</strong> r = ${radius.toFixed(2)}</p>
        <p>strong>Substitution:</strong> A = π × (${radius.toFixed(2)})²</p>
        `;

        const radiusSquared = radius ** 2;
        const areaValue = Math.PI * radiusSquared;

        const areaSteps = `
        <h4>Step-by-Step Calculation</h4>
        
        <p><strong>Step 1:</strong> Square the radius.</p>
        <p>${radius.toFixed(2)}² = ${radiusSquared.toFixed(2)}</p>
        
        <p><strong>Step 2:</strong> Multiply by π.</p>
        <p>π × ${radiusSquared.toFixed(2)} ≈ ${areaValue.toFixed(2)}</p>
        
        <p><strong>Final Answer:</strong> A ≈ ${areaValue.toFixed(2)} square units</p>
        `;

        const circumferenceExplanation = `
        <h4>Understanding Circumference</h4>
        <p>Circumference is the distance around the outside of a circle.</p>
        <p><strong>Formula:</strong> C = 2πr</p>
        <p><strong>Radius:</strong> r = ${radius.toFixed(2)}</p>
        <p><strong>Substitution:</strong> C = 2 × π × ${radius.toFixed(2)}</p>
        `;

        const circumferenceProduct = 2 * radius;
        const circumferenceValue = circumferenceProduct * Math.PI;

        const circumferenceSteps = `
        <h4>Step-by-Step Calculation</h4>
        <p><strong>Step 1:</strong> Multiply the radius by 2</p>
        <p>2 × ${radius.toFixed(2)} = ${circumferenceProduct.toFixed(2)}</p>
        
        <p><strong>Step 2:</strong> Multiply by π.</p>
        <p>${circumferenceProduct.toFixed(2)} × π ≈ ${circumferenceValue.toFixed(2)}</p>
        
        <p><strong>Final Answer:</strong> C ≈ ${circumferenceValue.toFixed(2)}</p>
        `;

        circleMeasurements = `
            <h4>Circle Measurements</h4>
            <p><strong>Radius:</strong> ${radius.toFixed(2)}</p>
            <p><strong>Diameter:</strong> ${diameter.toFixed(2)}</p>
            <p><strong>Circumference:</strong>${circumference.toFixed(2)}</p>
            <p><strong>Area:</strong> ${area.toFixed(2)}</p>
            ${circumferenceExplanation}
            ${circumferenceSteps}
            ${areaExplanation}
            ${areaSteps}
            `;
    }

    if (object.type === "line" && points.length === 2) {
        const length = calculateDistance(points[0], points[1]);
        const slope = calculateSlope(points[0], points[1]);

        const x1 = points[0].coordinates.x;
        const y1 = points[0].coordinates.y;

        const x2 = points[1].coordinates.x;
        const y2 = points[1].coordinates.y;

        const deltaX = x2 - x1;
        const deltaY = y2 - y1;
        const deltaXSquared = deltaX ** 2;
        const deltaYSquared = deltaY ** 2;
        const sumOfSquares = deltaXSquared + deltaYSquared;

        const distanceSteps = `
            <h4>Step-by-Step Calculation</h4>
            <p><strong>Step 1:</strong> Find the coordinate differences.</p>
            <p>Δx = ${deltaX}, Δy = ${deltaY}</p>
            
            <p><strong>Step 2:</strong> Square both differences.</p>
            <p>(${deltaX})² = ${deltaXSquared}</p>
            <p>(${deltaY})² = ${deltaYSquared}</p>
            
            <p><strong>Step 3:</strong> Add the squared differences.</p>
            <p>${deltaXSquared} + ${deltaYSquared} = ${sumOfSquares}</p>
            
            <p><strong>Step 4:</strong> Take the square root.</p>
            <p>d = √${sumOfSquares} = ${length.toFixed(2)}</p>
            `;

        const distanceExplaination = `
        <h4>Understanding the Distance Formula</h4>
        <p>The distance formula calculates the length between two points using their horizontal and vertical differences.<p>
        <p><strong>Formula:</strong> d = √((x₂ - x₁)² + (y₂ - y₁)²)</p>
        <p><strong>Substitution:</strong> d = √((${x2} - ${x1})² + (${y2} - ${y1})²)</p>
        `;

        lineMeasurements = `
        <h4>Line Measurements</h4>
        <p><strong>Length:</strong> ${length.toFixed(2)}</p>
        <p><strong>Slope:</strong> ${slope === null ? "Undefined (vertical line)" : slope.toFixed(2)}</p>
        ${distanceExplaination}
        ${distanceSteps}
        `;
    }

    details.innerHTML = `
    <h3>${object.type.charAt(0).toUpperCase() + object.type.slice(1)}</h3>
    <p><strong>ID:</strong> ${object.id}</p>
    <h4>Coordinates</h4>
    ${points.map((point, index) => `
        <p>
            Point ${index + 1} :
            (${point.coordinates.x}, ${point.coordinates.y})
            </p>
            `).join(" ")} 
            ${lineMeasurements}
            ${circleMeasurements}
            ${triangleMeasurements}
            ${rectangleMeasurements}
            ${polygonMeasurements}
            `;
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

/** Calculate the intersection of two line segments.
 * Returns the intersection coordinates or null if they don't cross
 */
function calculateLineIntersection(pointA, pointB, pointC, pointD) {
    const x1 = pointA.coordinates.x;
    const y1 = pointA.coordinates.y;
    const x2 = pointB.coordinates.x;
    const y2 = pointB.coordinates.y;

    const x3 = pointC.coordinates.x;
    const y3 = pointC.coordinates.y;
    const x4 = pointD.coordinates.x;
    const y4 = pointD.coordinates.y;

    const denominator =
        (x1 - x2) * (y3 - y4) -
        (y1 - y2) * (x3 - x4);

    // parallel or colinear segments don't have one unique intersection
    if (denominator ===0) {
        return null;
    }

    const t = 
        ((x1 - x3) * (y3 - y4) -
    (y1 - y3) * (x3 - x4)) / denominator;

    const u =
    -((x1 - x2) * (y1 - y3) -
(y1 - y2) * (x1 - x3)) / denominator;

// keep the intersection within both finite line segments
if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null;
}

return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1)
    };
}

/**
 * Calculate the angle at vertex B, in degrees
 * A-B-C forms the angle, with B as the vertex
 */
function calculateAngle(pointA, vertexB, pointC) {
    const ax = pointA.coordinates.x - vertexB.coordinates.x;
    const ay = pointA.coordinates.y - vertexB.coordinates.y;

    const cx = pointC.coordinates.x - vertexB.coordinates.x;
    const cy = pointC.coordinates.y - vertexB.coordinates.y;

    const dotProduct = ax * cx + ay * cy;

    const magnitudeA = Math.sqrt(ax * ax + ay * ay);
    const magnitudeC = Math.sqrt(cx * cx + cy * cy);
    
    if (magnitudeA === 0 || magnitudeC === 0) {
        return null;
    }

    const cosine = dotProduct / (magnitudeA * magnitudeC);

    // protect against floating-point rounding errors
    const clampedCosine = Math.max(-1, Math.min(1, cosine));

    return Math.acos(clampedCosine) * (180 / Math.PI);
}

/**
 * Find the two endpoint objects belonging to a saved line
 */
function getLineEndpoints(lineObject) {
    const pointA = geometryObjects.find(
        (item) => item.id === lineObject.pointAId
    );

    const pointB = geometryObjects.find(
        (item) => item.id === lineObject.pointBId
    );

    if (!pointA || !pointB) {
        return null;
    }

    return { pointA, pointB};
}

/**
 * Find intersections between pairs of saved line segments
 */
function findLineIntersections() {
    const lines = geometryObjects.filter(
        (object) => object.type === "line"
    );

    const intersections = [];

    for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
            const endpointsA = getLineEndpoints(lines[i]);
            const endpointsB = getLineEndpoints(lines[j]);

            if (!endpointsA || !endpointsB) {
                continue;
            }

            const intersection = calculateLineIntersection(
                endpointsA.pointA,
                endpointsA.pointB,
                endpointsB.pointA,
                endpointsB.pointB
            );

            if (intersection) {
                intersections.push({
                    lineAId: lines[i].id,
                    lineBId: lines[j].id,
                    coordinates: intersection
                });
            }
        }
    }
    return intersections;
}

/**
* Check whether four ordered points form a rectangle.
*/
function isValidRectangle(points) {
if (points.length !== 4 || points.some((point) => !point)) {
return false;
}

const [A, B, C, D] = points;

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

if (lengths.some((side) => side < 0.000001)) {
return false;
}

const tolerance = 0.0001;

// Opposite sides must be parallel.
const parallelAB_CD =
Math.abs(cross(AB, CD)) / (length(AB) * length(CD));

const parallelBC_DA =
Math.abs(cross(BC, DA)) / (length(BC) * length(DA));

if (
parallelAB_CD > tolerance ||
parallelBC_DA > tolerance
) {
return false;
}

// Adjacent sides must be perpendicular.
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

    const minorInterval = getSnapInterval();
    const minorPixels = SCALE * minorInterval;

    // Draw vertical grid lines
   for (
    let x = centerX - unitsAcross * SCALE;
    x <= centerX + unitsAcross * SCALE;
    x += minorPixels
   ) {
    const mathX = (x-centerX) / SCALE;
    const gridIndex = Math.round(mathX / minorInterval);

    // every fifth subdivision is a mjor grid line
    const isMajor = gridIndex % 5 === 0;

    const line = createSVGElement("line", {
        x1: x,
        y1: 0,
        x2: x,
        y2: height,
        class: isMajor ? "grid-lines-major" : "grid-lines"
    });

    gridLines.appendChild(line);
   }

    // Draw horizontal grid lines
   for (
    let y = centerY - unitsDown * SCALE;
    y <= centerY + unitsDown * SCALE;
    y += minorPixels
   ) {
    const mathY = (centerY - y) / SCALE;
    const gridIndex = Math.round(mathY / minorInterval);

    // every fifth subdivision is a major grid line
    const isMajor = gridIndex % 5 === 0;

    const line = createSVGElement("line", {
        x1: 0,
        y1: y,
        x2: width,
        y2: y,
        class: isMajor ? "grid-lines-major" : "grid-lines"
    });

    gridLines.appendChild(line);
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
            "data-object-id": object.id,
            class: "geometry-object"
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
            "data-object-id": object.id,
            class: "geometry-object"
        });
        shapes.appendChild(circle);
    });

    // draw triangles before points

geometryObjects.forEach((object) => {
    if (object.type !== "triangle") return;

    const trianglePoints = object.pointIds.map((pointId) =>
    
    geometryObjects.find((item) => item.id === pointId)
);

// skip triangles with missing vertices
if (trianglePoints.some((point) => !point)) return;

const screenPoints = trianglePoints.map((point) =>
mathToScreen(
    point.coordinates.x,
    point.coordinates.y
    )
);

const pointsAttribute = screenPoints.map((point) => 
`${point.x}, ${point.y}`)
.join(" ");

const triangle = createSVGElement("polygon", {
    points: pointsAttribute,
    fill: "rgba(52, 211, 153, 0.12)",
    stroke: "#34d399",
    "stroke-width": 2.5,
    "data-object-id": object.id,
    class: "geometry-object"
});

shapes.appendChild(triangle);

if (showIntersections) {

// Draw subtle interiror angle arcs
for (let i = 0; i < 3; i++) {
    const vertex = screenPoints[i];
    const pointA = screenPoints[(i + 1) % 3];
    const pointC = screenPoints[(i + 2) % 3];

// Calculate the directions from the vertex to the other corners
const angleA = Math.atan2(
    pointA.y - vertex.y,
    pointA.x - vertex.x
);

const angleC = Math.atan2(
    pointC.y - vertex.y,
    pointC.x - vertex.x
);

// normalize the opening to the samller interiror angle
let startAngle = angleA;
let endAngle = angleC;

while (endAngle < startAngle) {
    endAngle += 2 * Math.PI;
}

if (endAngle - startAngle > Math.PI) {
    [startAngle, endAngle] = [endAngle - 2 * Math.PI, startAngle];
}

const radius = 16;

const startX = vertex.x + radius * Math.cos(startAngle);
const startY = vertex.y + radius * Math.sin(startAngle);
const endX = vertex.x + radius * Math.cos(endAngle);
const endY = vertex.y + radius * Math.sin(endAngle);

const angleArc = createSVGElement("path", {
    d: `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`,
    fill: "none",
    stroke: "#34d399",
    "stroke-width": 1.5,
    opacity: 0.6,
    "pointer-events": "none",
    class: "angle-arc"
});

shapes.appendChild(angleArc);

// calculate the interiror angle in degrees
const angleDegrees = Math.acos(
    Math.max(-1, Math.min(1,
        Math.cos(endAngle - startAngle)
    ))
) * (180 / Math.PI);

// Position the label halfway inside the angle
const middleAngle = (startAngle + endAngle) / 2;
const labelRadius = radius + 13;

const labelX = vertex.x + labelRadius * Math.cos(middleAngle);
const labelY = vertex.y + labelRadius * Math.sin(middleAngle);

// create the degree label
const angleLabel = createSVGElement("text", {
    x: labelX,
    y: labelY,
    fill: "#34d399",
    "font-size": 10,
    opacity: 0.75,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "pointer-events": "none",
    class: "angle-label"
});

angleLabel.textContent = `${Math.round(angleDegrees)}°`;
shapes.appendChild(angleLabel);
}}

});

//draw rectangles before points
geometryObjects.forEach((object) => {
    if (object.type !== "rectangle") return;

    const rectanglePoints = object.pointIds.map((pointId) =>
    geometryObjects.find((item) => item.id === pointId)
);

// skip rectangles with missing vertices
if (rectanglePoints.some((point) => !point)) return;

const screenPoints = rectanglePoints.map((point) =>
mathToScreen(
    point.coordinates.x,
    point.coordinates.y
    )
); 

const pointsAttribute = screenPoints
    .map((point) => `${point.x} ,${point.y}`)
    .join(" ");

    const rectangle = createSVGElement("polygon", {
        points: pointsAttribute,
        fill: "rgba(167, 139, 250, 0.12)",
        stroke: "#a78bfa",
        "stroke-width": 2.5,
        "stroke-linejoin": "round",
        "data-object-id": object.id,
        class: "geometry-object"
    });

    shapes.appendChild(rectangle);

if (showIntersections) {
    // draw subtle right-angle markers for the vertices
    for (let i = 0; i < 4; i++) {
        const vertex = screenPoints[i];
        const previous = screenPoints[(i + 3) % 4];
        const next = screenPoints[(i + 1) % 4];
    
    // Find unit directions from the vertex along adjacent sides
    const dx1 = previous.x - vertex.x;
    const dy1 = previous.y - vertex.y;
    const dx2 = next.x - vertex.x;
    const dy2 = next.y - vertex.y

    const length1 = Math.hypot(dx1, dy1)
    const length2 = Math.hypot(dx2, dy2)

    if (length1 === 0 || length2 === 0) continue;

    const u1 = { x: dx1 / length1, y: dy1 / length1 };
    const u2 = { x: dx2 / length2, y: dy2 / length2 };

    // size of the little right-angle square
    const size = 11;

    const p1 = {
        x: vertex.x + u1.x * size,
        y: vertex.y + u1.y * size
    };

    const corner = {
        x: vertex.x + (u1.x + u2.x) * size,
        y: vertex.y + (u1.y + u2.y) * size
    };

    const p2 = {
        x: vertex.x + u2.x * size,
        y: vertex.y + u2.y * size
    }

    const marker = createSVGElement("path", {
        d: `M ${p1.x} ${p1.y} L ${corner.x} ${corner.y} L ${p2.x} ${p2.y}`,
        fill: "none",
        stroke: "#a78bfa",
        "stroke-width": 1.5,
        opacity: 0.65,
        "pointer-events": "none",
        class: "right-angle-marker"
    });

    shapes.appendChild(marker);
    }}
});

// Draw polygons before points
geometryObjects.forEach((object) => {
    if (object.type !== "polygon") return;

    const polygonPoints = object.pointIds.map((pointId) =>
    geometryObjects.find((item) => item.id === pointId)
);

// skip polygons with missing vertices
if (polygonPoints.some((point) => !point)) return;

const screenPoints = polygonPoints.map((point) =>
    mathToScreen(
        point.coordinates.x,
        point.coordinates.y
    )
);

const pointsAttribute = screenPoints
    .map((point) => `${point.x}, ${point.y}`)
    .join(" ");

const polygon = createSVGElement("polygon", {
    points: pointsAttribute,
    fill: "rgba(251,191,36,0.12)",
    stroke: "#fbbf24",
    "stroke-width": 2.5,
    "stroke-linejoin": "round",
    "data-object-id": object.id,
    class: "geometry-object"
});

shapes.appendChild(polygon);

if (showIntersections) {
// calculate polygon orientation
let signedArea = 0;

for (let i = 0; i < screenPoints.length; i++) {
    const current = screenPoints[i];
    const next = screenPoints[(i + 1) % screenPoints.length];

    signedArea += current.x * next.y - next.x * current.y;
}

const clockwise = signedArea > 0;

// draw subtle interiror angle arcs
for (let i = 0; i < screenPoints.length; i++) {
    const vertex = screenPoints[i];
    const previous = screenPoints[
        (i - 1 + screenPoints.length) % screenPoints.length
    ];
    const next = screenPoints[(i + 1) % screenPoints.length];

    const anglePrev = Math.atan2(
        previous.y - vertex.y,
        previous.x - vertex.x
    );

    const angleNext = Math.atan2(
        next.y - vertex.y,
        next.x - vertex.x
    );

    // select the interior direction based on the polygon orientation
    let startAngle = clockwise ? angleNext : anglePrev;
    let endAngle = clockwise ? anglePrev : angleNext;

    while (endAngle <= startAngle) {
        endAngle += 2 * Math.PI;
    }

    const difference = endAngle - startAngle;
    const radius = 12;

    const startX = vertex.x + radius * Math.cos(startAngle);
    const startY = vertex.y + radius * Math.sin(startAngle);
    const endX = vertex.x + radius * Math.cos(endAngle);
    const endY = vertex.y + radius * Math.sin(endAngle);

    const largeArc = difference > Math.PI ? 1 : 0;

    const angleArc = createSVGElement("path", {
        d: `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`,
        fill: "none",
        stroke: "#fbbf24",
        "stroke-width": 1.5,
        opacity: 0.6,
        "pointer-events": "none",
        class: "angle-arc"
    });

    shapes.appendChild(angleArc);

    // calculate the interior angles in degrees
    const angleDegrees = difference * (180 / Math.PI);

    // find the middle direction of the angle
    const middleAngle = startAngle + difference / 2;

    // position the label inside the polygon 
    const labelRadius = radius + 13;

    const labelX = vertex.x + labelRadius * Math.cos(middleAngle);
    const labelY = vertex.y + labelRadius * Math.sin(middleAngle);

    // create the degree label
    const angleLabel = createSVGElement("text", {
        x: labelX,
        y: labelY,
        fill: "#fbbf24",
        "font-size": 10,
        opacity: 0.75,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "pointer-events": "none",
        class: "angle-label"
    });

    angleLabel.textContent = `${Math.round(angleDegrees)}°`;
    shapes.appendChild(angleLabel);
}}
});

    // draw points on top of line
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

    // draw markers at line intersections
    if (showIntersections) {
        const intersections = findLineIntersections();

        intersections.forEach((intersection) => {
            const screen = mathToScreen(
                intersection.coordinates.x,
                intersection.coordinates.y
            );

            const lineA = geometryObjects.find(
                (object) => object.id === intersection.lineAId
            );

            const lineB = geometryObjects.find(
                (object) => object.id === intersection.lineBId
            );

            const endpointsA = lineA && getLineEndpoints(lineA);
            const endpointsB = lineB && getLineEndpoints(lineB);

            if (endpointsA && endpointsB) {
                const screenA1 = mathToScreen(
                    endpointsA.pointA.coordinates.x,
                    endpointsA.pointA.coordinates.y
                );

                const screenA2 = mathToScreen(
                    endpointsA.pointB.coordinates.x,
                    endpointsA.pointB.coordinates.y
                );

                const screenB1 = mathToScreen(
                    endpointsB.pointA.coordinates.x,
                    endpointsB.pointA.coordinates.y
                );

                const screenB2 = mathToScreen(
                    endpointsB.pointB.coordinates.x,
                    endpointsB.pointB.coordinates.y
                );

                console.log("Endpoint screen coordinates:", {
                    screenA1,
                    screenA2,
                    screenB1,
                    screenB2
                });

                console.log("Original endpoint coordinates:", {
                    pointA1: endpointsA.pointA.coordinates,
                    pointA2: endpointsA.pointB.coordinates,
                    pointB1: endpointsB.pointA.coordinates,
                    pointB2: endpointsB.pointB.coordinates
                });

                // the 4 rays extending from the intersections
                const rays = [screenA1, screenA2, screenB1, screenB2];

                console.log("Intersection screen:", screen);
                console.log("Intersection rays:", rays);

                // sort the rays by their direction around the intersection
                rays.sort((a, b) => {
                    const angleA = Math.atan2(
                        a.y - screen.y,
                        a.x - screen.x
                    );

                    const angleB = Math.atan2(
                        b.y - screen.y,
                        b.x - screen.x
                    );

                    return angleA - angleB;
                });

                console.log("Sorted rays:", rays);
                console.log("Intersection used for sorting:", screen);

                // draw an arc in each opening between adjacent rays
                for (let i = 0; i < 4; i++) {
                    const pointA = rays[i];
                    const pointC = rays[(i + 1) % 4];

                    const angleA = Math.atan2(
                        pointA.y - screen.y,
                        pointA.x - screen.x
                    );

                    let angleC = Math.atan2(
                        pointC.y - screen.y,
                        pointC.x - screen.x
                    );

                    // ensure the next ray follows the sorted circular order
                    while (angleC <= angleA) {
                        angleC += 2 * Math.PI;
                    }

                    const difference = angleC - angleA;
                    console.log("Angle opening", {
                        index: i,
                        angleA: angleA * (180 / Math.PI),
                        angleC: angleC * (180 / Math.PI),
                        difference: difference * (180 / Math.PI)
                    });

                    // skip invalid or nearly straight openings
                    if (
                        !Number.isFinite(angleA) ||
                        !Number.isFinite(angleC) ||
                        difference <= 0.001 ||
                        difference >= Math.PI - 0.001
                    ) {
                        continue;
                    }

                    const pairA = i % 2 === 0;
                    const radius = pairA ? 22 : 30;
                    const color = pairA ? "#2563eb" : "#f59e0b";

                    const startX = screen.x + radius * Math.cos(angleA);
                    const startY = screen.y + radius * Math.sin(angleA);
                    const endX = screen.x + radius * Math.cos(angleC);
                    const endY = screen.y + radius * Math.sin(angleC);

                    if (
                        !Number.isFinite(startX) ||
                        !Number.isFinite(startY) ||
                        !Number.isFinite(endX) ||
                        !Number.isFinite(endY)
                    ) {
                        continue;
                    }

                    const arc = createSVGElement("path", {
                        d: `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`,
                        fill: "none",
                        stroke: color,
                        "stroke-width": 2,
                        "pointer-events": "none",
                        class: "angle-arc"
                    });

                    shapes.appendChild(arc);

                    // calculate the angle measurement in degrees
                    const angleDegrees = difference * (180 / Math.PI);

                    // Find the middle direction of the angle
                    const middleAngle = angleA + difference / 2;

                    // Position the label between the vertex and the arc
                if (i === 0 || i === 1) {
                    const labelRadius = radius + 15;
                    const labelX = screen.x + labelRadius * Math.cos(middleAngle);
                    const labelY = screen.y + labelRadius * Math.sin(middleAngle);

                    // Create the angle measurement label
                    const angleLabel = createSVGElement("text", {
                        x: labelX,
                        y: labelY,
                        fill: color,
                        "font-size": 12,
                        "text-anchor": "middle",
                        "pointer-events": "none",
                        class: "angle-label"
                    });

                    angleLabel.textContent = `${Math.round(angleDegrees)}°`;
                    shapes.appendChild(angleLabel);
                }}
            }
        });
    }
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

canvas.addEventListener("mousemove", (event) => {
    // only show the preview when using the Point tool
    if (currentTool !== "point") {
        if (previewPoint) {
            previewPoint.remove();
            previewPoint = null;
        }
        return;
    }

    // get the cursor position relative to SVG canvas
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    //convert the cursor position into mathematical coordinates
    const pointCoordinates = screenToMath(screenX, screenY);

    // snap to the same interval used when creating a point
    const interval = getSnapInterval();
    const x = snapToGrid(pointCoordinates.x, interval);
    const y = snapToGrid(pointCoordinates.y, interval);

    // draw the preview at snapped position
    drawPreviewPoint(x, y);
});

// Handle clicks on the drawing surface
canvas.addEventListener("click", (event) => {
    const bounds = canvas.getBoundingClientRect();

    const screenX = event.clientX - bounds.left;
    const screenY = event.clientY - bounds.top;

    // select tool: existing points and geometry objects
    if (currentTool === "select") {
        const clickedElement = document.elementFromPoint(
            event.clientX,
            event.clientY
        );

        const selectableElement = clickedElement?.closest(
            ".geometry-point, .geometry-object"
        );

        if (selectableElement && shapes.contains(selectableElement)) {
            selectedObjectId = selectableElement.dataset.objectId;

            const selectedObject = geometryObjects.find(
                (object) => object.id === selectedObjectId
            );

            renderPoints();
            updateMathExplorer(selectedObject);

            status.textContent =
            `Selected ${selectedObject.type}: ${selectedObject.id}.`;
        } else {
            selectedObjectId = null;
            renderPoints();
            updateMathExplorer(null);
            
            status.textContent = "Nothing selected.";
        }

        return;
    }

    // Point tool: create new point
    if (currentTool === "point") {
        const pointCoordinates = screenToMath(screenX, screenY);

        const x = snapToGrid(pointCoordinates.x);
        const y = snapToGrid(pointCoordinates.y);

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
                `Center selected: ${clickedPointId}. Now click a second point to set the radius.`;

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
            `Selected ${firstTrianglePointIds.length} of 3 vertices. Choose the next point.`;

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

    // Rectangle tool: choose 4 points in order
    if (currentTool === "rectangle") {
        const pointElement = event.target.closest?.(".geometry-point");

        if (!pointElement || !shapes.contains(pointElement)) {
            status.textContent =
                "Click an existing point to define the rectangle.";
            return;
        }

        const clickedPointId =
            pointElement.getAttribute("data-object-id");

        if (firstRectanglePointIds.includes(clickedPointId)) {
            status.textContent =
                "Choose a different point for each rectangle vertex.";
            return;
        }

        firstRectanglePointIds.push(clickedPointId);

        if (firstRectanglePointIds.length < 4) {
            status.textContent =
                `Selected ${firstRectanglePointIds.length} of 4 vertices. Choose the next point.`;
            return;
        }

        const rectanglePoints = firstRectanglePointIds.map((pointId) =>
            geometryObjects.find((object) => object.id === pointId)
        );

        if (!isValidRectangle(rectanglePoints)) {
            firstRectanglePointIds = [];

            status.textContent =
                "Those points don't form a rectangle. Please select four vertices again, in order.";
            return;
        }

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

    // Polygon tool: choose points and click starting point to close shape
    if (currentTool === "polygon") {
    const pointElement = event.target.closest?.(".geometry-point");

    if (!pointElement || !shapes.contains(pointElement)) {
        status.textContent = 
        "Click an existing point to create a polygon.";
        return;
    }

    const clickedPointId = 
    pointElement.getAttribute("data-object-id");

    // if the starting point is clicked again, close the polygon
    if (
        firstPolygonPointIds.length >= 3 &&
        clickedPointId === firstPolygonPointIds[0]
    ) {
        const polygonObject = {
            id: `polygon-${nextObjectId++}`,
            type: "polygon",
            pointIds: [...firstPolygonPointIds]
        };

        geometryObjects.push(polygonObject);
        firstPolygonPointIds = [];

        renderPoints();

        status.textContent =
            `Created ${polygonObject.id} with a closed polygon.`;

            console.log("Created polygon:", polygonObject);

            return;
    }

    // prevent selecting the same vertex more than once
    if (firstPolygonPointIds.includes(clickedPointId)) {
        status.textContent =
            "Choose a different point, or click the starting point to close the polygon.";
            return;
    }

    // remember the selected vertex
    firstPolygonPointIds.push(clickedPointId);

    status.textContent =
    `Selected ${firstPolygonPointIds.length} polygon vertices. ${firstPolygonPointIds.length < 3
        ? "Choose at least one more point."
        : "Click the starting point again to close the polygon."
    }`;

    return;
}

    // other tools for later
    status.textContent = 
    `Selected tool: ${currentTool}. This tool will be later.`;
});

// add clcik setting for toggle intersections
const toggleIntersectionsButton = document.getElementById(
    "toggle-intersections"
);

function updateIntersectionToggle() {
    toggleIntersectionsButton.textContent = showIntersections
    ? "Hide Intersections & Angles"
    : "Show Intersections & Angles";

    toggleIntersectionsButton.classList.toggle(
        "active",
        showIntersections
    );

    toggleIntersectionsButton.classList.toggle(
        "inactive",
        !showIntersections
    );
}

// Math Explorer: collapse and expand panel
const mathExplorer = document.getElementById("math-explorer");
const mathExplorerToggle = document.getElementById("math-explorer-toggle");
const mathExplorerContent = document.getElementById("math-explorer-content");
const mathExplorerHeader = document.getElementById("math-explorer-header");

mathExplorerToggle.addEventListener("click", () => {
    const isCollapsed = mathExplorerContent.style.display === "none";

    mathExplorerContent.style.display = isCollapsed ? "block" : "none";
    mathExplorerToggle.textContent = isCollapsed ? "-" : "+";
});

// math explorer: draggable panel
let isDraggingExplorer = false;
let explorerOffsetX = 0;
let explorerOffsetY = 0;

mathExplorerHeader.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;

    isDraggingExplorer = true;

    const rect = mathExplorer.getBoundingClientRect();

    explorerOffsetX = event.clientX - rect.left;
    explorerOffsetY = event.clientY - rect. top;

    mathExplorerHeader.setPointerCapture(event.pointerId);
    mathExplorerHeader.style.cursor = "grabbing";
});

mathExplorerHeader.addEventListener("pointermove", (event) => {
    if (!isDraggingExplorer) return;

    const newX = event.clientX - explorerOffsetX;
    const newY = event.clientY - explorerOffsetY;

    const maxX = window.innerWidth - mathExplorer.offsetWidth;
    const maxY = window.innerHeight - mathExplorer.offsetHeight;

    mathExplorer.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
    mathExplorer.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;

    mathExplorer.style.right = "auto";
    mathExplorer.style.bottom = "auto";
});

mathExplorerHeader.addEventListener("pointerup", () => {
    isDraggingExplorer = false;
    mathExplorerHeader.style.cursor = "grab";
});

mathExplorerHeader.addEventListener("pointercancel", () => {
    isDraggingExplorer = false;
    mathExplorerHeader.style.cursor = "grab";
});

toggleIntersectionsButton.addEventListener("click", () => {
    showIntersections = !showIntersections;
    updateIntersectionToggle();
    renderPoints();
});

updateIntersectionToggle();

// Keep the coordinate plane centered in window
function redrawForZoom() {
    drawCoordinatePlane();
    renderPoints();
    document.getElementById("zoom-level").textContent = 
    Math.round((SCALE / INITIAL_SCALE) * 100) + "%";
}

//keep the coordinate plane centered when the window resizes
window.addEventListener("resize", () => {
    requestAnimationFrame(redrawForZoom);
});

// initialize after the page layout is ready
window.addEventListener("load", () => {
    requestAnimationFrame(redrawForZoom);
});

document.getElementById("zoom-in").addEventListener("click", () => {
    SCALE = Math.min(SCALE * 1.25, MAX_SCALE);
    redrawForZoom();
});

document.getElementById("zoom-out").addEventListener("click", () => {
    SCALE = Math.max(SCALE / 1.25, MIN_SCALE);
    redrawForZoom();
});

document.getElementById("zoom-reset").addEventListener("click", () => {
    SCALE = INITIAL_SCALE;
    redrawForZoom();
});

console.log("Geometry Engine initialized with mathematical coordinates.");

// user guide functionality

const userGuideButton = document.getElementById("user-guide-button");
const userGuideModal = document.getElementById("user-guide-modal");
const closeUserGuideButton = document.getElementById("close-user-guide");

// get user guide elements

const guideSlideTitle = document.getElementById("guide-slide-title");
const guideSlideHeading = document.getElementById("guide-slide-heading");
const guideSlideDescription = document.getElementById("guide-slide-description");
const guideSlideVisual = document.getElementById("guide-slide-visual");

const guidePreviousButton = document.getElementById("guide-previous");
const guideNextButton = document.getElementById("guide-next");
const guideFinishButton = document.getElementById("guide-finish");
const guideSkipButton = document.getElementById("guide-skip");

const guideDots = document.querySelectorAll(".guide-dot");

// tutorial info

const guideSlides = [
    {
        title: "Getting Started",
        heading: "Welcome to the Geometry Engine!",
        description: "Explore an interactive coordinate plane where you can create geometric objects, visualize properties, and investigate the mathematics behind them.",
        visual: "📐"
    },

    {
        title: "Understanding the Toolbar",
        heading: "Your Geometry Toolkit",
        description: "The toolbar contains several tools for interacting with the coordinate plane. Select lets you explore existing objects, Point places individual points, and the Line, Circle, Rectangle, Triangle, and Polygon tools allow you to construct different geometric objects by connecting points.",
        visual: "🛠️"
    },

    {
        title: "Creating Geometric Objects",
        heading: "Build Your Geometry",
        description: "Choose a geometric tool and select the required points on the coordinate plane. Lines connect two points, circles use a center and radius point, rectangles and triangles use their vertices, and polygons connect three or more selected vertices into one enclosed shape. Each are all separate geometric objects.",
        visual: "✏️"
    },

    {
        title: "Selecting Objects",
        heading: "Explore Your Creations",
        description: "Choose the Select tool and click an existing point, line, or geometric shape. Selecting an object allows you to examine its properties in the Math Explorer. You can switch between objects whenever you want to investigate something new.",
        visual: "👆🔍"
    },

    {
        title: "Math Explorer",
        heading: "Discover the Mathematics",
        description: "The Math Explorer displays information about your selected object, including its ID, vertex coordinates, and mathematical properties. Depending on the object, you can explore measurements such as length, slope, radius, area, perimeter, and interior angles. You can also drag or collapse the panel. The Equation Library provides a place to explore important geometry formulas.",
        visual: "📊"
    }

];

// Track the current slide

let currentGuideSlide = 0;

// Display the requested slide

function showGuideSlide(index) {
    
    if (index < 0 || index >= guideSlides.length) {
        return;
    }

    currentGuideSlide = index;

    const slide = guideSlides[currentGuideSlide];

    // update slide content

    guideSlideTitle.textContent = slide.title;
    guideSlideHeading.textContent = slide.heading;
    guideSlideDescription.textContent = slide.description;
    guideSlideVisual.textContent = slide.visual;

    // update progress indicators

    guideDots.forEach((dot, dotIndex) => {

        dot.classList.toggle("active", dotIndex === currentGuideSlide);
    });

    // update navigation buttons

    guidePreviousButton.disabled = currentGuideSlide === 0;

    // show finish on the last slide

    if (currentGuideSlide === guideSlides.length - 1) {

        guideNextButton.style.display = "none";
        guideFinishButton.style.display = "inline-block";
    } else {

        guideNextButton.style.display = "inline-block";
        guideFinishButton.style.display = "none";
    }
}

// open the user guide

userGuideButton.addEventListener("click", () => {

    showGuideSlide(0);

    userGuideModal.style.display = "flex";

});

// close the user guide

function closeUserGuide() {

    userGuideModal.style.display = "none";
}

closeUserGuideButton.addEventListener("click", closeUserGuide);

// close when clicking outside the panel

userGuideModal.addEventListener("click", (event) => {

    if (event.target === userGuideModal) {

        closeUserGuide();
    }
});

// previous slide

guidePreviousButton.addEventListener("click", () => {

    showGuideSlide(currentGuideSlide - 1);
});

// next slide

guideNextButton.addEventListener("click", () => {

    showGuideSlide(currentGuideSlide + 1);
});

// skip tutorial

guideSkipButton.addEventListener("click", closeUserGuide);

// finish tutorial

guideFinishButton.addEventListener("click", closeUserGuide);

// allow users to click progress circles

guideDots.forEach((dot, index) => {

    dot.addEventListener("click", () => {

        const slideIndex = Number(dot.dataset.slide);

        showGuideSlide(slideIndex);
    });
});

// close with escape key

document.addEventListener("keydown", (event) => {

    if (event.key === "Escape" && userGuideModal.style.display === "flex") {

        closeUserGuide();
    }
});

// intialize the first slide

showGuideSlide(0);

// Equation library

const equationLibraryButton = document.getElementById("equation-library-button");
const equationLibraryView = document.getElementById("equation-library-view");
const mathExplorerWelcome = document.getElementById("math-explorer-welcome");
const mathExplorerDetails = document.getElementById("math-explorer-details");
const backToMathExplorerButton = document.getElementById("back-to-math-explorer");

// open library

equationLibraryButton.addEventListener("click", function() {

    mathExplorerWelcome.style.display = "none";
    mathExplorerDetails.style.display = "none";
    equationLibraryButton.style.display = "none";

    equationLibraryView.style.display = "block";
});

// return to math explorer

backToMathExplorerButton.addEventListener("click", function() {

    equationLibraryView.style.display = "none";

    mathExplorerWelcome.style.display = "block";
    mathExplorerDetails.style.display = "block";
    equationLibraryButton.style.display = "block";
});

// library expand and collapse

const equationToggles = document.querySelectorAll(".equation-toggle");

equationToggles.forEach(function(toggle) {

    const equationContent = toggle.nextElementSibling;

    // start collapsed
    toggle.classList.remove("expanded");
    toggle.setAttribute("aria-expanded", "false");

    toggle.addEventListener("click", function() {

        const isExpanded = toggle.classList.contains("expanded");

        if (isExpanded) {

            // collapse
            toggle.classList.remove("expanded");
            toggle.setAttribute("aria-expanded", "false");

        } else {
            
            //expand
            toggle.classList.add("expanded");
            toggle.setAttribute("aria-expanded", "true");
        }

    });

});
   

