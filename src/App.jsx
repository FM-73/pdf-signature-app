import React, { useEffect, useRef, useState } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
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
  const [dragging, setDragging] = useState(false);
  const [points, setPoints] = useState([]);

  const [sigPos, setSigPos] = useState({
    x: 80,
    y: 120,
    width: 180,
    height: 80
  });

  useEffect(() => {
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    if (pdfDocPreview) renderPage(pdfDocPreview, pageNumber);
  }, [pdfDocPreview, pageNumber, sigPos]);

  async function loadPdf(e) {
    const file = e.target.files[0];
    if (!file) return;

    const bytes = await file.arrayBuffer();
    const copy = bytes.slice(0);

    setPdfFile(file);
    setPdfBytes(copy);
    setSignedUrl(null);

    const loadingTask = pdfjsLib.getDocument({ data: copy.slice(0) });
    const pdf = await loadingTask.promise;

    setPdfDocPreview(pdf);
    setPageCount(pdf.numPages);
    setPageNumber(1);
  }

  async function renderPage(pdf, pageNum) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = pdfCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
    drawSignatureBox();
  }

  function drawSignatureBox() {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.strokeStyle = "red";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(sigPos.x, sigPos.y, sigPos.width, sigPos.height);
    ctx.fillStyle = "rgba(255,0,0,0.08)";
    ctx.fillRect(sigPos.x, sigPos.y, sigPos.width, sigPos.height);
    ctx.restore();
  }

  function getCanvasPos(e, canvas) {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    let clientX;
    let clientY;
    let pressure = null;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      pressure = e.touches[0].force || null;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
      pressure = e.pressure || null;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      pressure,
      time: new Date().toISOString(),
      timestamp: performance.now()
    };
  }

  function startSign(e) {
    const canvas = signCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = getCanvasPos(e, canvas);

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);

    setPoints((old) => [...old, { ...p, event: "start" }]);
    setDrawing(true);
  }

  function moveSign(e) {
    if (!drawing) return;

    const canvas = signCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = getCanvasPos(e, canvas);

    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    setPoints((old) => [...old, { ...p, event: "move" }]);
  }

  function endSign(e) {
    e?.preventDefault?.();
    setPoints((old) => [
      ...old,
      { event: "end", time: new Date().toISOString(), timestamp: performance.now() }
    ]);
    setDrawing(false);
  }

  function clearSignature() {
    const canvas = signCanvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setPoints([]);
  }

  function startDrag(e) {
    const canvas = pdfCanvasRef.current;
    const p = getCanvasPos(e, canvas);

    const inside =
      p.x >= sigPos.x &&
      p.x <= sigPos.x + sigPos.width &&
      p.y >= sigPos.y &&
      p.y <= sigPos.y + sigPos.height;

    if (inside) setDragging(true);
  }

  function moveDrag(e) {
    if (!dragging) return;

    const canvas = pdfCanvasRef.current;
    const p = getCanvasPos(e, canvas);

    setSigPos((old) => ({
      ...old,
      x: Math.max(0, p.x - old.width / 2),
      y: Math.max(0, p.y - old.height / 2)
    }));
  }

  function endDrag(e) {
    e?.preventDefault?.();
    setDragging(false);
  }

  function enlargeBox() {
    setSigPos((old) => ({
      ...old,
      width: old.width + 20,
      height: old.height + 10
    }));
  }

  function shrinkBox() {
    setSigPos((old) => ({
      ...old,
      width: Math.max(80, old.width - 20),
      height: Math.max(40, old.height - 10)
    }));
  }

  async function sha256Hex(data) {
    const buffer = data instanceof ArrayBuffer ? data : data.buffer;
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function enrichPoints(rawPoints) {
    return rawPoints.map((point, index) => {
      const previous = index > 0 ? rawPoints[index - 1] : null;

      if (
        !previous ||
        point.event === "start" ||
        previous.event === "end" ||
        typeof point.x !== "number" ||
        typeof previous.x !== "number"
      ) {
        return {
          ...point,
          deltaMs: 0,
          distanceFromPrevious: 0,
          velocityPxPerMs: 0
        };
      }

      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const deltaMs = Math.max((point.timestamp || 0) - (previous.timestamp || 0), 0);

      return {
        ...point,
        deltaMs: Number(deltaMs.toFixed(3)),
        distanceFromPrevious: Number(distance.toFixed(3)),
        velocityPxPerMs: deltaMs > 0 ? Number((distance / deltaMs).toFixed(6)) : 0
      };
    });
  }

  async function signPdf() {
    if (!pdfBytes) {
      alert("Bitte zuerst ein PDF auswählen.");
      return;
    }

    const pdfDoc = await PDFDocument.load(pdfBytes.slice(0));
    const pages = pdfDoc.getPages();
    const page = pages[pageNumber - 1];

    const pdfWidth = page.getWidth();
    const pdfHeight = page.getHeight();

    const previewCanvas = pdfCanvasRef.current;
    const scaleX = pdfWidth / previewCanvas.width;
    const scaleY = pdfHeight / previewCanvas.height;

    const x = sigPos.x * scaleX;
    const width = sigPos.width * scaleX;
    const boxHeight = (sigPos.height + 70) * scaleY;
    const y = pdfHeight - sigPos.y * scaleY - boxHeight;

    const signatureImageData = signCanvasRef.current.toDataURL("image/png");
    const signaturePng = await pdfDoc.embedPng(signatureImageData);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    page.drawRectangle({
      x,
      y,
      width,
      height: boxHeight,
      borderWidth: 1,
      borderColor: rgb(0.25, 0.25, 0.25),
      color: rgb(1, 1, 1),
      opacity: 0.95
    });

    page.drawText("Digital signiert", {
      x: x + 8,
      y: y + boxHeight - 18,
      size: 10,
      font
    });

    page.drawImage(signaturePng, {
      x: x + 8,
      y: y + 10,
      width: width - 16,
      height: sigPos.height * scaleY
    });

    page.drawText(`Name: ${name}`, { x: x + 8, y: y + boxHeight - 32, size: 8, font });
    page.drawText(`Ort: ${place}`, { x: x + 8, y: y + boxHeight - 42, size: 8, font });
    page.drawText(`Zweck: ${purpose}`, { x: x + 8, y: y + boxHeight - 52, size: 8, font });
    page.drawText(`Datum: ${date}`, { x: x + 8, y: y + boxHeight - 62, size: 8, font });

    const originalHash = await sha256Hex(pdfBytes.slice(0));
    const signatureImageHash = await sha256Hex(
      new TextEncoder().encode(signatureImageData)
    );

    const enrichedPoints = enrichPoints(points);

    const evidence = {
      schema: "document-centered-signature-evidence-v1",
      createdAt: new Date().toISOString(),
      signer: {
        name,
        place,
        purpose,
        declaredDate: date
      },
      document: {
        originalFileName: pdfFile?.name || null,
        originalSha256: originalHash,
        signedPage: pageNumber
      },
      visibleSignature: {
        imageSha256: signatureImageHash,
        imageFormat: "image/png",
        canvasWidth: signCanvasRef.current.width,
        canvasHeight: signCanvasRef.current.height
      },
      signaturePlacement: {
        page: pageNumber,
        x,
        y,
        width,
        height: boxHeight,
        previewCanvasWidth: previewCanvas.width,
        previewCanvasHeight: previewCanvas.height,
        scaleX,
        scaleY
      },
      biometricSignatureData: {
        warning:
          "Pressure/pointer data depends on device and browser support and is not guaranteed.",
        pointCount: enrichedPoints.length,
        points: enrichedPoints
      },
      auditTrail: [
        {
          event: "pdf_loaded",
          time: new Date().toISOString(),
          fileName: pdfFile?.name || null
        },
        {
          event: "signature_drawn",
          time: new Date().toISOString(),
          pointCount: enrichedPoints.length
        },
        {
          event: "metadata_confirmed",
          time: new Date().toISOString(),
          name,
          place,
          purpose,
          date
        },
        {
          event: "pdf_visibly_signed",
          time: new Date().toISOString()
        }
      ],
      runtime: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      },
      note:
        "Diese eingebetteten Daten dienen der späteren Beweisführung. Das PDF enthält in dieser Version eine sichtbare Signatur und Evidenzdaten, aber noch keine PAdES/PKCS#7-Signatur."
    };

    const evidenceBytes = new TextEncoder().encode(JSON.stringify(evidence, null, 2));

    await pdfDoc.attach(evidenceBytes, "signature-evidence.json", {
      mimeType: "application/json",
      description: "Beweisdaten zur handschriftlichen PDF-Signatur",
      creationDate: new Date(),
      modificationDate: new Date()
    });

    const signed = await pdfDoc.save();

    const signedHash = await sha256Hex(signed);

    const finalPdfDoc = await PDFDocument.load(signed);
    finalPdfDoc.setTitle(pdfFile?.name || "Signiertes PDF");
    finalPdfDoc.setSubject("Dokumentenzentrierte sichtbare Signatur mit Evidenzdaten");
    finalPdfDoc.setProducer("PDF Signature App");
    finalPdfDoc.setCreator("PDF Signature App");
    finalPdfDoc.setKeywords([
      "signed",
      "signature-evidence",
      `original-sha256:${originalHash}`,
      `signed-sha256:${signedHash}`
    ]);
    finalPdfDoc.setModificationDate(new Date());

    const finalBytes = await finalPdfDoc.save();

    const blob = new Blob([finalBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    setSignedUrl(url);
  }

  async function savePdf() {
    if (!signedUrl) return;

    const response = await fetch(signedUrl);
    const blob = await response.blob();

    const filename =
      (pdfFile?.name || "dokument.pdf").replace(/\.pdf$/i, "") +
      "_signiert.pdf";

    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "PDF",
            accept: { "application/pdf": [".pdf"] }
          }
        ]
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = filename;
      a.click();
    }
  }

  async function sharePdf() {
    if (!signedUrl) return;

    const response = await fetch(signedUrl);
    const blob = await response.blob();

    const filename =
      (pdfFile?.name || "dokument.pdf").replace(/\.pdf$/i, "") +
      "_signiert.pdf";

    const file = new File([blob], filename, { type: "application/pdf" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: filename,
        text: filename,
        files: [file]
      });
    } else {
      alert("Teilen wird auf diesem Gerät nicht unterstützt.");
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>PDF Signature App</h1>

        <input type="file" accept="application/pdf" onChange={loadPdf} />

        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Ort" value={place} onChange={(e) => setPlace(e.target.value)} />
        <input placeholder="Zweck" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <label>Seite</label>
        <select value={pageNumber} onChange={(e) => setPageNumber(Number(e.target.value))}>
          {Array.from({ length: pageCount }).map((_, index) => (
            <option key={index + 1} value={index + 1}>
              Seite {index + 1}
            </option>
          ))}
        </select>

        <h3>PDF-Vorschau</h3>

        <canvas
          ref={pdfCanvasRef}
          style={{
            width: "100%",
            display: "block",
            border: "1px solid #ccc",
            touchAction: "none",
            background: "white"
          }}
          onMouseDown={startDrag}
          onMouseMove={moveDrag}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={startDrag}
          onTouchMove={moveDrag}
          onTouchEnd={endDrag}
        />

        <button onClick={shrinkBox}>Signaturfeld kleiner</button>
        <button onClick={enlargeBox}>Signaturfeld größer</button>

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
            background: "white"
          }}
          onMouseDown={startSign}
          onMouseMove={moveSign}
          onMouseUp={endSign}
          onMouseLeave={endSign}
          onTouchStart={startSign}
          onTouchMove={moveSign}
          onTouchEnd={endSign}
        />

        <button onClick={clearSignature}>Signatur löschen</button>
        <button onClick={signPdf}>PDF signieren</button>

        {signedUrl && (
          <>
            <button onClick={savePdf}>PDF speichern</button>
            <button onClick={sharePdf}>PDF senden / teilen</button>
          </>
        )}
      </div>
    </div>
  );
}
