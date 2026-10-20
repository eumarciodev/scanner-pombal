import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import { scanPage } from './scanner.js';

const readDocs = () => { try { const value = JSON.parse(localStorage.getItem('folha_docs') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const readConfig = () => {
  const envConfig = { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY };
  if (envConfig.url && envConfig.key) return envConfig;
  try { return JSON.parse(localStorage.getItem('folha_supabase') || '{}'); } catch { return {}; }
};
const dateLabel = (date) => new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    file: <><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 14h6M10 17h6"/></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14"/></>,
    whatsapp: <><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.7A8.5 8.5 0 1 1 20.5 11.5Z"/><path d="M8.5 8.5c.5 3 2 4.5 5 5.5l1-1.1 2 .8"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4L7.7 15a8 8 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8H14l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 1.8Z" transform="translate(-1 -1)"/></>,
    camera: <><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function App() {
  const [pages, setPages] = useState([]);
  const [docs, setDocs] = useState(readDocs);
  const [config, setConfig] = useState(readConfig);
  const [modal, setModal] = useState(false);
  const [urlField, setUrlField] = useState('');
  const [keyField, setKeyField] = useState('');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraAspect, setCameraAspect] = useState(4 / 3);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [pdfPreparing, setPdfPreparing] = useState(false);
  const [scanNeedsCheck, setScanNeedsCheck] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const videoRef = useRef(null);
  const client = useMemo(() => config.url && config.key ? createClient(config.url, config.key) : null, [config]);
  const filtered = docs.filter((doc) => doc.name.toLowerCase().includes(query.toLowerCase()));

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const persist = (next) => { setDocs(next); localStorage.setItem('folha_docs', JSON.stringify(next)); };

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.from('scanned_documents').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!active) return;
      if (error) { notify('Confira a tabela e as permissões do Supabase.'); return; }
      persist(data || []);
    });
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    if (videoRef.current && cameraStream) videoRef.current.srcObject = cameraStream;
    return () => cameraStream?.getTracks().forEach((track) => track.stop());
  }, [cameraStream]);

  useEffect(() => {
    let cancelled = false;
    if (!pages.length) { setPdfBlob(null); setPdfPreparing(false); setScanNeedsCheck(false); return undefined; }
    setPdfPreparing(true);
    generatePdf(pages).then((result) => { if (!cancelled) { setPdfBlob(result.blob); setScanNeedsCheck(result.needsCheck); } })
      .catch((error) => { if (!cancelled) { setPdfBlob(null); notify(`Não foi possível preparar o PDF: ${error.message}`); } })
      .finally(() => { if (!cancelled) setPdfPreparing(false); });
    return () => { cancelled = true; };
  }, [pages]);

  const addFiles = (files) => setPages((current) => [...current, ...Array.from(files).filter((file) => file.type.startsWith('image/'))]);
  const removePage = (index) => setPages((current) => current.filter((_, i) => i !== index));
  const openCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('A câmera ao vivo não está disponível neste navegador. Use “Escolher fotos” para selecionar uma imagem.'); setCameraOpen(true); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
      setCameraStream(stream); setCameraOpen(true);
    } catch (error) {
      setCameraError(error.name === 'NotAllowedError' ? 'Permita o acesso à câmera no navegador para fotografar as páginas.' : 'Não foi possível abrir a câmera. Você pode escolher fotos da galeria.');
      setCameraOpen(true);
    }
  };
  const closeCamera = () => { cameraStream?.getTracks().forEach((track) => track.stop()); setCameraStream(null); setCameraOpen(false); setCameraError(''); };
  const capturePage = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { setCameraError('A câmera ainda está iniciando. Tente novamente em alguns segundos.'); return; }
    const frameHeight = 0.9;
    const frameWidth = Math.min(0.88, (Math.SQRT1_2 * frameHeight) / (video.videoWidth / video.videoHeight));
    const left = (1 - frameWidth) / 2;
    const top = (1 - frameHeight) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { setCameraError('Não foi possível capturar a foto.'); return; }
      const photo = new File([blob], `pagina-${pages.length + 1}.jpg`, { type: 'image/jpeg' });
      photo.scanGuide = { left, top, width: frameWidth, height: frameHeight };
      setPages((current) => [...current, photo]);
      setCameraError('');
    }, 'image/jpeg', 0.98);
  };
  const generatePdf = async (imageFiles) => {
    let pdf = null;
    let needsCheck = false;
    for (let index = 0; index < imageFiles.length; index += 1) {
      const image = await scanPage(imageFiles[index]);
      if (!image.detected && !imageFiles[index].scanGuide) needsCheck = true;
      const orientation = image.width > image.height ? 'landscape' : 'portrait';
      if (!pdf) pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
      else pdf.addPage('a4', orientation);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
      const width = image.width * scale; const height = image.height * scale;
      pdf.addImage(image.data, 'JPEG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
    }
    return { blob: pdf.output('blob'), needsCheck };
  };

  const makePdf = async () => {
    if (!pages.length || busy || pdfPreparing) return;
    setBusy(true);
    try {
      const result = pdfBlob ? { blob: pdfBlob, needsCheck: scanNeedsCheck } : await generatePdf(pages);
      const blob = result.blob;
      if (result.needsCheck) notify('Não consegui detectar os cantos de uma imagem. Confira o PDF e, se necessário, tire outra foto com a folha inteira visível.');
      const id = crypto.randomUUID();
      const name = `Documento-${new Date().toISOString().slice(0, 10)}-${String(docs.length + 1).padStart(2, '0')}.pdf`;
      const created_at = new Date().toISOString();
      const item = { id, name, pages: pages.length, created_at };
      if (client) {
        const storage_path = `${id}.pdf`;
        const { error: uploadError } = await client.storage.from('scans').upload(storage_path, blob, { contentType: 'application/pdf' });
        if (uploadError) throw uploadError;
        const { data } = client.storage.from('scans').getPublicUrl(storage_path);
        Object.assign(item, { storage_path, public_url: data.publicUrl });
        const { error: insertError } = await client.from('scanned_documents').insert({ ...item, public_url: data.publicUrl });
        if (insertError) { await client.storage.from('scans').remove([storage_path]); throw insertError; }
      } else item.local_url = URL.createObjectURL(blob);
      persist([item, ...docs]); setPages([]);
      notify(client ? 'PDF salvo no Supabase!' : 'PDF criado neste dispositivo.');
    } catch (error) { console.error(error); notify(`Não foi possível salvar: ${error.message || 'tente novamente'}`); }
    finally { setBusy(false); }
  };

  const finishCamera = async () => {
    if (!pages.length || pdfPreparing || busy) return;
    closeCamera();
    await makePdf();
  };

  const download = async (doc) => {
    let downloadUrl = doc.local_url || doc.public_url;
    if (client && doc.storage_path) {
      const { data, error } = await client.storage.from('scans').download(doc.storage_path);
      if (error) { notify('Falha ao baixar o PDF.'); return; }
      downloadUrl = URL.createObjectURL(data);
    }
    const anchor = document.createElement('a'); anchor.href = downloadUrl; anchor.download = doc.name; anchor.click();
  };

  const share = async (doc) => {
    try {
      let blob;
      if (client && doc.storage_path) {
        const { data, error } = await client.storage.from('scans').download(doc.storage_path);
        if (error) throw error;
        blob = data;
      } else if (doc.local_url) {
        const response = await fetch(doc.local_url);
        blob = await response.blob();
      }
      if (blob) {
        const file = new File([blob], doc.name, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] }) && navigator.share) {
          await navigator.share({ files: [file], title: doc.name, text: 'Documento digitalizado com Scanner Pombal' });
          return;
        }
      }
      const shareUrl = doc.public_url || doc.url;
      if (navigator.share && shareUrl) {
        await navigator.share({ title: doc.name, text: 'Documento digitalizado com Scanner Pombal', url: shareUrl });
        return;
      }
      if (shareUrl) {
        window.open(`https://wa.me/?text=${encodeURIComponent(`Segue o documento ${doc.name}: ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
        return;
      }
      if (blob) {
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a'); anchor.href = downloadUrl; anchor.download = doc.name; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
        notify('Este navegador não oferece o menu de compartilhamento. O PDF foi baixado para você compartilhar.');
        return;
      }
      notify('Não foi possível abrir o arquivo. Gere o PDF novamente para compartilhar.');
    } catch (error) {
      if (error.name !== 'AbortError') notify(`Não foi possível compartilhar: ${error.message || 'tente novamente'}`);
    }
  };

  const openSettings = () => { setUrlField(config.url || ''); setKeyField(config.key || ''); setModal(true); };
  const saveSettings = () => {
    if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
      notify('Edite o arquivo .env para alterar as credenciais do Supabase.');
      return;
    }
    if (!urlField.trim() || !keyField.trim()) { notify('Preencha a URL e a chave pública.'); return; }
    const next = { url: urlField.trim(), key: keyField.trim() };
    localStorage.setItem('folha_supabase', JSON.stringify(next)); setConfig(next); setModal(false);
  };
  const disconnect = () => {
    if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
      notify('Remova as credenciais do arquivo .env para desconectar.');
      return;
    }
    localStorage.removeItem('folha_supabase'); setConfig({}); setModal(false);
  };

  return <div className="shell">
    <header className="topbar"><div className="brand"><img className="brand-logo" src="/logo-pombal.jpeg" alt="Grupo Pedra do Pombal" /><span>Scanner Pombal</span></div><div className="topright"><span className={`status ${client ? 'online' : ''}`} /><span>{client ? 'Supabase conectado' : 'Salvando neste dispositivo'}</span><button className="iconbtn" title="Configurar Supabase" onClick={openSettings}><Icon name="settings" size={18} /></button></div></header>
    <section className="hero"><div><div className="eyebrow">Seu scanner de bolso</div><h1>Digitalize. Guarde.<br />Compartilhe.</h1><p>Transforme suas folhas em PDFs organizados em segundos.</p></div><button className="newbtn" onClick={() => fileRef.current?.click()}><Icon name="plus" />Novo escaneamento</button></section>
    <main className="main">
      <section className="card scan-card"><div className="cardhead"><h2>Novo escaneamento</h2><span className="step">{pages.length} {pages.length === 1 ? 'página' : 'páginas'}</span></div>
        <div className={`drop ${dragging ? 'drag' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
          <div className="upload-icon"><Icon name="upload" size={24} /></div><strong>Adicione as páginas do documento</strong><p>Fotografe as páginas em sequência ou escolha imagens da galeria</p><div className="drop-actions"><button className="softbtn" onClick={() => fileRef.current?.click()}>Escolher fotos</button><button className="softbtn camera-btn" onClick={openCamera}><Icon name="camera" size={17} />Usar câmera</button></div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
        </div>
        {pages.length > 0 && <div className="thumbs">{pages.map((page, index) => <div className="thumb" key={`${page.name}-${index}`}><img src={URL.createObjectURL(page)} alt={`Página ${index + 1}`} /><span>{index + 1}</span><button aria-label="Remover página" onClick={() => removePage(index)}>×</button></div>)}</div>}
        <div className="scan-footer"><span className="hint">{pdfPreparing ? 'Enquadrando e melhorando as páginas…' : pdfBlob ? scanNeedsCheck ? 'Confira o enquadramento da imagem no PDF.' : `Documento A4 pronto · ${pages.length} ${pages.length === 1 ? 'página' : 'páginas'}` : 'Você pode adicionar várias páginas ao mesmo PDF.'}</span><button className="primary" disabled={!pages.length || busy || pdfPreparing} onClick={makePdf}><Icon name="file" />{busy ? 'Salvando PDF…' : pdfPreparing ? 'Preparando…' : pdfBlob ? 'Salvar PDF' : 'Gerar PDF'}</button></div>
      </section>
      <section className="card history"><div className="history-head"><h2>Seus documentos</h2><span className="count">{docs.length} {docs.length === 1 ? 'arquivo' : 'arquivos'}</span></div><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no histórico..." aria-label="Buscar documentos" />
        <div className="list">{filtered.length ? filtered.map((doc) => <div className="doc" key={doc.id}><div className="pdf-icon"><Icon name="file" /></div><div className="docinfo"><div className="docname" title={doc.name}>{doc.name}</div><div className="docmeta">{doc.pages} {doc.pages === 1 ? 'página' : 'páginas'} · {dateLabel(doc.created_at)}</div></div><div className="docactions"><button className="iconbtn" title="Baixar PDF" onClick={() => download(doc)}><Icon name="download" size={16} /></button><button className="iconbtn" title="Compartilhar no WhatsApp" onClick={() => share(doc)}><Icon name="whatsapp" size={16} /></button></div></div>) : <div className="empty"><div className="upload-icon"><Icon name="file" /></div><strong>{query ? 'Nenhum resultado' : 'Seu histórico começa aqui'}</strong>{query ? 'Tente buscar por outro nome.' : 'Os PDFs que você criar aparecerão aqui.'}</div>}</div>
        <div className="syncbox"><span className={`status ${client ? 'online' : ''}`} /><div><strong>{client ? 'Sincronizado com Supabase' : 'Histórico neste dispositivo'}</strong><span>{client ? 'Seus PDFs e histórico ficam salvos na nuvem.' : 'Configure o Supabase para acessar seus PDFs online.'}</span></div></div>
      </section>
    </main><div className="footnote">Seus documentos ficam organizados com segurança no seu histórico.</div>
    {cameraOpen && <div className="modalback camera-backdrop"><section className="camera-modal" role="dialog" aria-modal="true" aria-labelledby="camera-title"><header className="camera-head"><div><h2 id="camera-title">Enquadre a folha</h2><p>{pages.length} {pages.length === 1 ? 'página capturada' : 'páginas capturadas'} · mantenha os quatro cantos visíveis</p></div><button className="iconbtn" onClick={closeCamera} aria-label="Fechar câmera">×</button></header>{cameraStream ? <div className="camera-stage" style={{ aspectRatio: cameraAspect, width: `min(100%, ${cameraAspect * 58}vh)` }}><video className="camera-view" ref={videoRef} onLoadedMetadata={(event) => setCameraAspect(event.currentTarget.videoWidth / event.currentTarget.videoHeight)} autoPlay playsInline muted /><div className="crop-frame" style={(() => { const h = 90; const w = Math.min(88, (Math.SQRT1_2 * h) / cameraAspect * 100); return { width: `${w}%`, height: `${h}%`, left: `${(100-w)/2}%`, top: '5%' }; })()}><i /><i /><i /><i /></div></div> : <div className="camera-placeholder"><Icon name="camera" size={34} /><span>{cameraError || 'Iniciando câmera…'}</span></div>}{cameraError && cameraStream && <p className="camera-error">{cameraError}</p>}<div className="camera-help">O scanner localiza as bordas da folha, corrige a perspectiva e limpa o fundo antes de montar cada página A4.</div><div className="camera-actions"><button className="softbtn" onClick={closeCamera}>Cancelar</button><button className="primary capture-btn" disabled={!cameraStream} onClick={capturePage}><Icon name="camera" size={18} />Capturar página</button><button className="primary finish-btn" disabled={!pages.length || pdfPreparing || busy} onClick={finishCamera}>{busy ? 'Salvando…' : pdfPreparing ? 'Preparando PDF…' : `Concluir e criar PDF (${pages.length})`}</button></div></section></div>}
    {toast && <div className="message show" role="status">{toast}</div>}
  </div>;
}

export default App;
