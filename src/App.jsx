import React, { useEffect, useRef, useState } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export default function App() {
  const canvasRef = useRef(null);

  const [pdfFile, setPdfFile] = useState(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [signedUrl, setSignedUrl] = useState(null);

  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [purpose, setPurpose] = useState("Kundenunterschrift");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [pageNumber, setPageNumber] = useState(1);
  const [posX, setPosX] = useState(40);
  const [posY, setPosY] = useState(120);
  const [sigWidth, setSigWidth] = useState(220);

  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPos(e) {
    e.preventDefault();

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];

    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;

    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function start(e) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = getPos(e);

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
  }

  function move(e) {
    if (!drawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = getPos(e);

    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end(e) {
    e?.preventDefault?.();
    setDrawing(false);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function loadPdf(e) {
    const file = e.target.files[0];
    if (!file) return;

    const bytes = await file.arrayBuffer();

    setPdfFile(file);
    setPdfBytes(bytes);
    setSignedUrl(null);
  }

  async function signPdf() {
    if (!pdfBytes) {
      alert("Bitte PDF laden");
      return;
    }

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    const selectedPageIndex = Math.min(
      Math.max(Number(pageNumber) - 1, 0),
      pages.length - 1
    );

    const page = pages[selectedPageIndex];
    const pageHeight = page.getHeight();

    const png = await pdfDoc.embedPng(canvasRef.current.toDataURL("image/png"));
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const sigHeight = Math.round(Number(sigWidth) * 0.35);
    const boxHeight = sigHeight + 95;

    const x = Number(posX);
    const yFromTop = Number(posY);
    const y = pageHeight - yFromTop - boxHeight;

    page.drawRectangle({
      x,
      y,
      width: Number(sigWidth),
      height: boxHeight,
      borderWidth: 1,
      borderColor: rgb(0.25, 0.25, 0.25),
      color: rgb(1, 1, 1),
      opacity: 0.9,
    });

    page.drawText("Digital signiert", {
      x: x + 10,
      y: y + boxHeight - 20,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawImage(png, {
      x: x + 10,
      y: y + 55,
      width: Number(sigWidth) - 20,
      height: sigHeight,
    });

    page.drawText(`Name: ${name}`, {
      x: x + 10,
      y: y + 40,
      size: 9,
      font,
    });

    page.drawText(`Ort: ${place}`, {
      x: x + 10,
      y: y + 28,
      size: 9,
      font,
    });

    page.drawText(`Zweck: ${purpose}`, {
      x: x + 10,
      y: y + 16,
      size: 9,
      font,
    });

    page.drawText(`Datum: ${date}`, {
      x: x + 10,
      y: y + 4,
      size: 9,
      font,
    });

    const signed = await pdfDoc.save();

    const blob = new Blob([signed], { type: "application/pdf" });
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
            accept: { "application/pdf": [".pdf"] },
          },
        ],
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
        files: [file],
      });
    } else {
      alert("Teilen nicht unterstützt");
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

        <label>PDF-Seite</label>
        <input type="number" min="1" value={pageNumber} onChange={(e) => setPageNumber(e.target.value)} />

        <label>X-Position von links</label>
        <input type="number" value={posX} onChange={(e) => setPosX(e.target.value)} />

        <label>Y-Position von oben</label>
        <input type="number" value={posY} onChange={(e) => setPosY(e.target.value)} />

        <label>Signaturbreite</label>
        <input type="number" value={sigWidth} onChange={(e) => setSigWidth(e.target.value)} />

        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
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
