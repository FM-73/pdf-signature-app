import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function App() {
  const signCanvasRef = useRef(null);
  const pdfCanvasRef = useRef(null);

  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);

  const [pdfDocPreview, setPdfDocPreview] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const [signedUrl, setSignedUrl] = useState(null);

  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [purpose, setPurpose] = useState("Kundenunterschrift");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [drawing, setDrawing] = useState(false);

  const [sigPos, setSigPos] = useState({
    x: 80,
    y: 120,
    width: 180,
    height: 80,
  });

  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const canvas = signCanvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  async function loadPdf(e) {
    const file = e.target.files[0];
    if (!file) return;

    const bytes = await file.arrayBuffer();

    setPdfBytes(bytes);
    setPdfFile(file);

    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    setPdfDocPreview(pdf);
    setPageCount(pdf.numPages);

    renderPage(pdf, 1);
  }

  async function renderPage(pdf, pageNum) {
    const page = await pdf.getPage(pageNum);

    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = pdfCanvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    drawSignatureBox();
  }

  function drawSignatureBox() {
    const canvas = pdfCanvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;

    ctx.strokeRect(
      sigPos.x,
      sigPos.y,
      sigPos.width,
      sigPos.height
    );
  }

  useEffect(() => {
    if (pdfDocPreview) {
      renderPage(pdfDocPreview, pageNumber);
    }
  }, [sigPos, pageNumber]);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();

    const touch = e.touches?.[0];

    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function startSign(e) {
    const canvas = signCanvasRef.current;
    const ctx = canvas.getContext("2d");

    const p = getPos(e, canvas);

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);

    setDrawing(true);
  }

  function moveSign(e) {
    if (!drawing) return;

    const canvas = signCanvasRef.current;
    const ctx = canvas.getContext("2d");

    const p = getPos(e, canvas);

    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function endSign() {
    setDrawing(false);
  }

  function clearSignature() {
    const canvas = signCanvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function startDrag(e) {
    const canvas = pdfCanvasRef.current;
    const p = getPos(e, canvas);

    if (
      p.x >= sigPos.x &&
      p.x <= sigPos.x + sigPos.width &&
      p.y >= sigPos.y &&
      p.y <= sigPos.y + sigPos.height
    ) {
      setDragging(true);
    }
  }

  function moveDrag(e) {
    if (!dragging) return;

    const canvas = pdfCanvasRef.current;
    const p = getPos(e, canvas);

    setSigPos((prev) => ({
      ...prev,
      x: p.x - prev.width / 2,
      y: p.y - prev.height / 2,
    }));
  }

  function endDrag() {
    setDragging(false);
  }

  async function signPdf() {
    if (!pdfBytes) return;

    const pdfDoc = await PDFDocument.load(pdfBytes);

    const pages = pdfDoc.getPages();
    const page = pages[pageNumber - 1];

    const pdfWidth = page.getWidth();
    const pdfHeight = page.getHeight();

    const previewCanvas = pdfCanvasRef.current;

    const scaleX = pdfWidth / previewCanvas.width;
    const scaleY = pdfHeight / previewCanvas.height;

    const png = await pdfDoc.embedPng(
      signCanvasRef.current.toDataURL("image/png")
    );

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const x = sigPos.x * scaleX;
    const y =
      pdfHeight -
      (sigPos.y + sigPos.height) * scaleY;

    const width = sigPos.width * scaleX;
    const height = sigPos.height * scaleY;

    page.drawRectangle({
      x,
      y,
      width,
      height: height + 60,
      color: rgb(1, 1, 1),
      borderWidth: 1,
    });

    page.drawText("Digital signiert", {
      x: x + 8,
      y: y + height + 42,
      size: 10,
      font,
    });

    page.drawImage(png, {
      x: x + 8,
      y: y + 10,
      width: width - 16,
      height: height - 20,
    });

    page.drawText(`Name: ${name}`, {
      x: x + 8,
      y: y + height + 28,
      size: 8,
      font,
    });

    page.drawText(`Ort: ${place}`, {
      x: x + 8,
      y: y + height + 18,
      size: 8,
      font,
    });

    page.drawText(`Zweck: ${purpose}`, {
      x: x + 8,
      y: y + height + 8,
      size: 8,
      font,
    });

    page.drawText(`Datum: ${date}`, {
      x: x + 8,
      y: y + height - 2,
      size: 8,
      font,
    });

    const signed = await pdfDoc.save();

    const blob = new Blob([signed], {
      type: "application/pdf",
    });

    const url = URL.createObjectURL(blob);

    setSignedUrl(url);
  }

  function savePdf() {
    if (!signedUrl) return;

    const a = document.createElement("a");

    a.href = signedUrl;
    a.download = "signiert.pdf";

    a.click();
  }

  return (
    <div className="container">
      <div className="card">
        <h1>PDF Signature App</h1>

        <input
          type="file"
          accept="application/pdf"
          onChange={loadPdf}
        />

        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          placeholder="Ort"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
        />

        <input
          placeholder="Zweck"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <label>Seite</label>

        <select
          value={pageNumber}
          onChange={(e) => setPageNumber(Number(e.target.value))}
        >
          {Array.from({ length: pageCount }).map((_, i) => (
            <option key={i + 1} value={i + 1}>
              Seite {i + 1}
            </option>
          ))}
        </select>

        <h3>PDF Vorschau</h3>

        <canvas
          ref={pdfCanvasRef}
          style={{
            width: "100%",
            border: "1px solid #ccc",
            touchAction: "none",
          }}
          onMouseDown={startDrag}
          onMouseMove={moveDrag}
          onMouseUp={endDrag}
          onTouchStart={startDrag}
          onTouchMove={moveDrag}
          onTouchEnd={endDrag}
        />

        <h3>Unterschrift</h3>

        <canvas
          ref={signCanvasRef}
          width={600}
          height={200}
          style={{
            width: "100%",
            height: "200px",
            border: "1px solid #ccc",
            touchAction: "none",
          }}
          onMouseDown={startSign}
          onMouseMove={moveSign}
          onMouseUp={endSign}
          onMouseLeave={endSign}
          onTouchStart={startSign}
          onTouchMove={moveSign}
          onTouchEnd={endSign}
        />

        <button onClick={clearSignature}>
          Signatur löschen
        </button>

        <button onClick={signPdf}>
          PDF signieren
        </button>

        {signedUrl && (
          <button onClick={savePdf}>
            PDF speichern
          </button>
        )}
      </div>
    </div>
  );
}
