let cvPromise;

function getOpenCv() {
  if (window.cv?.Mat) return Promise.resolve(window.cv);
  if (window.cv?.then) return window.cv;
  if (cvPromise) return cvPromise;

  cvPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.12.0/opencv.js';
    script.async = true;
    const timeout = window.setTimeout(() => reject(new Error('Tempo esgotado')), 60000);
    const finish = (cv) => {
      if (cv?.then) { cv.then((ready) => { window.clearTimeout(timeout); resolve(ready); }, reject); return; }
      if (cv?.Mat) { window.clearTimeout(timeout); resolve(cv); return; }
      if (cv) {
        const previous = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => { previous?.(); window.clearTimeout(timeout); resolve(cv); };
      }
    };
    script.onload = () => finish(window.cv);
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error('Falha ao carregar OpenCV.js')); };
    document.head.appendChild(script);
  });
  return cvPromise;
}

function orderCorners(points) {
  const sums = points.map((point) => point.x + point.y);
  const differences = points.map((point) => point.x - point.y);
  return [
    points[sums.indexOf(Math.min(...sums))],
    points[differences.indexOf(Math.max(...differences))],
    points[sums.indexOf(Math.max(...sums))],
    points[differences.indexOf(Math.min(...differences))],
  ];
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function findPaper(cv, image) {
  const scale = Math.min(1, 1200 / Math.max(image.cols, image.rows));
  const small = new cv.Mat(); const gray = new cv.Mat(); const blur = new cv.Mat(); const edges = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
  try {
    cv.resize(image, small, new cv.Size(Math.round(image.cols * scale), Math.round(image.rows * scale)), 0, 0, cv.INTER_AREA);
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 35, 110);
    cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 2);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    let best = null; let bestArea = small.cols * small.rows * 0.13;
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const area = Math.abs(cv.contourArea(contour));
      if (area > bestArea && area < small.cols * small.rows * 0.97) {
        const perimeter = cv.arcLength(contour, true);
        for (const epsilon of [0.018, 0.025, 0.035, 0.05]) {
          const polygon = new cv.Mat();
          cv.approxPolyDP(contour, polygon, epsilon * perimeter, true);
          if (polygon.rows === 4 && cv.isContourConvex(polygon)) {
            const factor = 1 / scale;
            const corners = orderCorners(Array.from({ length: 4 }, (_, point) => ({ x: polygon.data32S[point * 2] * factor, y: polygon.data32S[point * 2 + 1] * factor })));
            const [tl, tr, br, bl] = corners;
            const width = Math.max(distance(tl, tr), distance(bl, br));
            const height = Math.max(distance(tl, bl), distance(tr, br));
            const ratio = Math.min(width, height) / Math.max(width, height);
            if (width > 180 && height > 180 && ratio > 0.42 && ratio < 0.92 && area > bestArea) {
              best = { corners, width, height };
              bestArea = area;
            }
          }
          polygon.delete();
        }
      }
      contour.delete();
    }
    return best;
  } finally {
    small.delete(); gray.delete(); blur.delete(); edges.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
  }
}

function fallbackThreshold(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = frame;
  const stride = width + 1;
  const sums = new Float64Array(stride * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      const i = ((y - 1) * width + x - 1) * 4;
      const gray = Math.round(.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]);
      rowSum += gray;
      sums[y * stride + x] = sums[(y - 1) * stride + x] + rowSum;
    }
  }
  const radius = Math.max(8, Math.round(Math.min(width, height) / 80));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const x1 = Math.max(0, x - radius); const y1 = Math.max(0, y - radius);
    const x2 = Math.min(width, x + radius + 1); const y2 = Math.min(height, y + radius + 1);
    const total = sums[y2 * stride + x2] - sums[y1 * stride + x2] - sums[y2 * stride + x1] + sums[y1 * stride + x1];
    const average = total / ((x2 - x1) * (y2 - y1));
    const i = (y * width + x) * 4;
    const value = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114 < average - 10 ? 20 : 255;
    data[i] = value; data[i + 1] = value; data[i + 2] = value;
  }
  context.putImageData(frame, 0, 0);
  return canvas;
}

export async function scanPage(file, filter = 'document') {
  const image = await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file); const element = new Image();
    element.onload = () => { URL.revokeObjectURL(objectUrl); resolve(element); };
    element.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Não foi possível abrir a foto.')); };
    element.src = objectUrl;
  });
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);

  let cv;
  try { cv = await getOpenCv(); } catch {
    const guide = file.scanGuide;
    if (guide) {
      const cropped = document.createElement('canvas'); cropped.width = Math.round(canvas.width * guide.width); cropped.height = Math.round(canvas.height * guide.height);
      cropped.getContext('2d').drawImage(canvas, canvas.width * guide.left, canvas.height * guide.top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
      if (filter === 'document') fallbackThreshold(cropped);
      else if (filter === 'grayscale') grayscaleCanvas(cropped);
      return { data: cropped.toDataURL('image/jpeg', .98), width: cropped.width, height: cropped.height, detected: false };
    }
    if (filter === 'document') fallbackThreshold(canvas);
    else if (filter === 'grayscale') grayscaleCanvas(canvas);
    return { data: canvas.toDataURL('image/jpeg', .98), width: canvas.width, height: canvas.height, detected: false };
  }

  const source = cv.imread(canvas); let page = null; let detected = false;
  try {
    const manualCorners = file.scanCorners?.map(({ x, y }) => ({ x: x * source.cols, y: y * source.rows }));
    const found = manualCorners ? { corners: orderCorners(manualCorners), width: source.cols, height: source.rows } : findPaper(cv, source);
    if (found) {
      const [tl, tr, br, bl] = found.corners;
      const pageWidth = Math.round(Math.max(distance(tl, tr), distance(bl, br)));
      const pageHeight = Math.round(Math.max(distance(tl, bl), distance(tr, br)));
      const resize = Math.min(1, 3500 / Math.max(pageWidth, pageHeight));
      const width = Math.max(1, Math.round(pageWidth * resize)); const height = Math.max(1, Math.round(pageHeight * resize));
      const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, found.corners.flatMap((point) => [point.x, point.y]));
      const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
      const transform = cv.getPerspectiveTransform(srcPoints, dstPoints);
      page = new cv.Mat();
      cv.warpPerspective(source, page, transform, new cv.Size(width, height), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
      srcPoints.delete(); dstPoints.delete(); transform.delete();
      detected = true;
    } else if (file.scanGuide) {
      const guide = file.scanGuide;
      page = source.roi(new cv.Rect(Math.round(source.cols * guide.left), Math.round(source.rows * guide.top), Math.round(source.cols * guide.width), Math.round(source.rows * guide.height)));
    } else page = source.clone();

    if (filter === 'color') {
      const colorCanvas = document.createElement('canvas'); colorCanvas.width = page.cols; colorCanvas.height = page.rows;
      cv.imshow(colorCanvas, page);
      return { data: colorCanvas.toDataURL('image/jpeg', .96), width: colorCanvas.width, height: colorCanvas.height, detected };
    }
    const gray = new cv.Mat(); const clean = new cv.Mat();
    cv.cvtColor(page, gray, cv.COLOR_RGBA2GRAY);
    if (filter === 'grayscale') {
      const grayCanvas = document.createElement('canvas'); grayCanvas.width = gray.cols; grayCanvas.height = gray.rows;
      cv.imshow(grayCanvas, gray);
      const result = { data: grayCanvas.toDataURL('image/jpeg', .96), width: grayCanvas.width, height: grayCanvas.height, detected };
      gray.delete(); clean.delete(); return result;
    }
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
    const blockSize = Math.max(3, Math.min(35, Math.floor(Math.min(gray.cols, gray.rows) / 2) * 2 - 1));
    cv.adaptiveThreshold(gray, clean, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize, 11);
    const output = document.createElement('canvas'); output.width = clean.cols; output.height = clean.rows;
    cv.imshow(output, clean);
    const result = { data: output.toDataURL('image/jpeg', .98), width: output.width, height: output.height, detected };
    gray.delete(); clean.delete();
    return result;
  } finally { page?.delete(); source.delete(); }
}

function grayscaleCanvas(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < frame.data.length; i += 4) {
    const value = Math.round(.299 * frame.data[i] + .587 * frame.data[i + 1] + .114 * frame.data[i + 2]);
    frame.data[i] = value; frame.data[i + 1] = value; frame.data[i + 2] = value;
  }
  context.putImageData(frame, 0, 0);
  return canvas;
}
