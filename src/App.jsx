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
const imageUrls = new WeakMap();
const previewImage = (file) => { if (!imageUrls.has(file)) imageUrls.set(file, URL.createObjectURL(file)); return imageUrls.get(file); };

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
  const [cropEditor, setCropEditor] = useState(null);
  const [cropCorners, setCropCorners] = useState([]);
  const [dragCorner, setDragCorner] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [pdfPreparing, setPdfPreparing] = useState(false);
  const [scanNeedsCheck, setScanNeedsCheck] = useState(false);
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [scanFilter, setScanFilter] = useState('document');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [docName, setDocName] = useState('');
  const [category, setCategory] = useState('Geral');
  const [ocrText, setOcrText] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [selectedPages, setSelectedPages] = useState([]);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const pdfPreviewUrl = useMemo(() => pdfBlob ? URL.createObjectURL(pdfBlob) : '', [pdfBlob]);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const videoRef = useRef(null);
  const cropSvgRef = useRef(null);
  const client = useMemo(() => config.url && config.key ? createClient(config.url, config.key) : null, [config]);
  const filtered = docs.filter((doc) => `${doc.name} ${doc.category || ''} ${doc.ocr_text || ''}`.toLowerCase().includes(query.toLowerCase()));

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const persist = (next) => { setDocs(next); localStorage.setItem('folha_docs', JSON.stringify(next)); };

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    if (!client) return;
    if (!session) { setDocs([]); return; }
    let active = true;
    client.from('scanned_documents').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!active) return;
      if (error) { notify('Confira as políticas privadas do Supabase.'); return; }
      persist(data || []);
    });
    return () => { active = false; };
  }, [client, session]);

  useEffect(() => {
    if (videoRef.current && cameraStream) videoRef.current.srcObject = cameraStream;
    return () => cameraStream?.getTracks().forEach((track) => track.stop());
  }, [cameraStream]);

  useEffect(() => () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); }, [pdfPreviewUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!pages.length) { setPdfBlob(null); setPdfPreparing(false); setScanNeedsCheck(false); return undefined; }
    setPdfPreparing(true);
    generatePdf(pages, scanFilter).then((result) => { if (!cancelled) { setPdfBlob(result.blob); setScanNeedsCheck(result.needsCheck); } })
      .catch((error) => { if (!cancelled) { setPdfBlob(null); notify(`Não foi possível preparar o PDF: ${error.message}`); } })
      .finally(() => { if (!cancelled) setPdfPreparing(false); });
    return () => { cancelled = true; };
  }, [pages, scanFilter]);

  const addFiles = (files) => setPages((current) => [...current, ...Array.from(files).filter((file) => file.type.startsWith('image/'))]);
  const removePage = (index) => {
    setPages((current) => current.filter((_, i) => i !== index));
    setSelectedPages((current) => current.filter((pageIndex) => pageIndex !== index).map((pageIndex) => pageIndex > index ? pageIndex - 1 : pageIndex));
  };
  const openCropEditor = (file, index) => {
    const previewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const guide = file.scanGuide || { left: 0.06, top: 0.04, width: 0.88, height: 0.92 };
      const corners = file.scanCorners || [
        { x: guide.left * 1000, y: guide.top * 1000 },
        { x: (guide.left + guide.width) * 1000, y: guide.top * 1000 },
        { x: (guide.left + guide.width) * 1000, y: (guide.top + guide.height) * 1000 },
        { x: guide.left * 1000, y: (guide.top + guide.height) * 1000 },
      ];
      setCropCorners(corners.map(({ x, y }) => ({ x, y })));
      setCropEditor({ file, index, previewUrl, aspect: image.naturalWidth / image.naturalHeight });
    };
    image.onerror = () => { URL.revokeObjectURL(previewUrl); notify('Não foi possível abrir esta imagem para ajustar.'); };
    image.src = previewUrl;
  };
  const closeCropEditor = () => {
    if (cropEditor?.previewUrl) URL.revokeObjectURL(cropEditor.previewUrl);
    setCropEditor(null); setCropCorners([]); setDragCorner(null);
  };
  const moveCropCorner = (event) => {
    if (dragCorner === null || !cropSvgRef.current) return;
    const bounds = cropSvgRef.current.getBoundingClientRect();
    const limits = [
      { x: [0, 500], y: [0, 500] }, { x: [500, 1000], y: [0, 500] },
      { x: [500, 1000], y: [500, 1000] }, { x: [0, 500], y: [500, 1000] },
    ][dragCorner];
    const x = Math.max(limits.x[0], Math.min(limits.x[1], (event.clientX - bounds.left) / bounds.width * 1000));
    const y = Math.max(limits.y[0], Math.min(limits.y[1], (event.clientY - bounds.top) / bounds.height * 1000));
    setCropCorners((current) => current.map((point, index) => index === dragCorner ? { x, y } : point));
  };
  const saveCropCorners = () => {
    const { file, index } = cropEditor;
    file.scanCorners = cropCorners.map(({ x, y }) => ({ x: x / 1000, y: y / 1000 }));
    setPages((current) => current.map((page, pageIndex) => pageIndex === index ? file : page));
    closeCropEditor();
    notify('Enquadramento atualizado. O PDF está sendo corrigido.');
  };
  const restoreAutoCrop = () => {
    const { file, index } = cropEditor;
    delete file.scanCorners;
    setPages((current) => current.map((page, pageIndex) => pageIndex === index ? file : page));
    closeCropEditor(); notify('Enquadramento automático restaurado.');
  };
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
  const generatePdf = async (imageFiles, filter = scanFilter) => {
    let pdf = null;
    let needsCheck = false;
    for (let index = 0; index < imageFiles.length; index += 1) {
      const image = await scanPage(imageFiles[index], filter);
      if (!image.detected && !imageFiles[index].scanGuide) needsCheck = true;
      const orientation = image.width > image.height ? 'landscape' : 'portrait';
      if (!pdf) pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4', compress: true });
      else pdf.addPage('a4', orientation);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
      const width = image.width * scale; const height = image.height * scale;
      pdf.addImage(image.data, 'JPEG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'MEDIUM');
    }
    return { blob: pdf.output('blob'), needsCheck };
  };

  const makePdf = async () => {
    if (!pages.length || busy || pdfPreparing) return;
    setBusy(true);
    try {
      const result = pdfBlob ? { blob: pdfBlob, needsCheck: scanNeedsCheck } : await generatePdf(pages, scanFilter);
      const blob = result.blob;
      if (result.needsCheck) notify('Não consegui detectar os cantos de uma imagem. Confira o PDF e, se necessário, tire outra foto com a folha inteira visível.');
      const id = crypto.randomUUID();
      const name = `${(docName.trim() || `Documento-${new Date().toISOString().slice(0, 10)}-${String(docs.length + 1).padStart(2, '0')}`).replace(/\.pdf$/i, '')}.pdf`;
      const created_at = new Date().toISOString();
      const item = { id, name, category: category.trim() || 'Geral', ocr_text: ocrText, pages: pages.length, created_at };
      if (client) {
        if (!session) throw new Error('Entre na sua conta para salvar PDFs privados no Supabase.');
        const storage_path = `${session.user.id}/${id}.pdf`;
        const { error: uploadError } = await client.storage.from('scans').upload(storage_path, blob, { contentType: 'application/pdf' });
        if (uploadError) throw uploadError;
        Object.assign(item, { storage_path, user_id: session.user.id });
        const { error: insertError } = await client.from('scanned_documents').insert(item);
        if (insertError) { await client.storage.from('scans').remove([storage_path]); throw insertError; }
      } else item.local_url = URL.createObjectURL(blob);
      persist([item, ...docs]); setPages([]);
      setDocName(''); setCategory('Geral'); setOcrText(''); setSelectedPages([]); setPreviewOpen(false);
      notify(client ? 'PDF privado salvo no Supabase!' : 'PDF criado neste dispositivo.');
    } catch (error) { console.error(error); notify(`Não foi possível salvar: ${error.message || 'tente novamente'}`); }
    finally { setBusy(false); }
  };

  const finishCamera = async () => {
    if (!pages.length || pdfPreparing || busy) return;
    closeCamera();
    setPreviewOpen(true);
  };

  const movePage = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    setPages((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
    setSelectedPages((current) => current.map((selected) => selected === index ? target : selected === target ? index : selected));
  };
  const recognizeText = async () => {
    if (!pages.length) return;
    setOcrBusy(true);
    try {
      if (!window.Tesseract) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js'; script.onload = resolve; script.onerror = () => reject(new Error('Não foi possível carregar o OCR.')); document.head.appendChild(script); });
      let combined = '';
      for (const page of pages) {
        const processed = await scanPage(page, scanFilter);
        const result = await window.Tesseract.recognize(processed.data, 'por');
        combined += `${result.data.text.trim()}\n\n`;
      }
      setOcrText(combined.trim()); notify('Texto reconhecido. Você pode copiá-lo ou salvar junto ao PDF.');
    } catch (error) { notify(error.message || 'Falha ao reconhecer o texto.'); }
    finally { setOcrBusy(false); }
  };
  const copyOcrText = async () => { try { await navigator.clipboard.writeText(ocrText); notify('Texto copiado.'); } catch { notify('Não foi possível copiar o texto neste navegador.'); } };
  const saveEdit = async () => {
    if (!editingDoc || !editName.trim()) return;
    const patch = { name: editName.trim().replace(/\.pdf$/i, '') + '.pdf', category: editCategory.trim() || 'Geral' };
    if (client) { const { error } = await client.from('scanned_documents').update(patch).eq('id', editingDoc.id); if (error) { notify('Não foi possível atualizar o documento.'); return; } }
    persist(docs.map((doc) => doc.id === editingDoc.id ? { ...doc, ...patch } : doc)); setEditingDoc(null); notify('Documento atualizado.');
  };
  const shareSelected = async () => {
    const chosen = pages.filter((_, index) => selectedPages.includes(index));
    if (!chosen.length) { notify('Selecione pelo menos uma página.'); return; }
    try {
      const { blob } = await generatePdf(chosen, scanFilter); const file = new File([blob], 'Paginas-selecionadas.pdf', { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: file.name });
      else { const link = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = link; anchor.download = file.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(link), 30000); notify('PDF das páginas selecionadas baixado para compartilhar.'); }
    } catch (error) { if (error.name !== 'AbortError') notify(`Falha ao compartilhar: ${error.message}`); }
  };
  const signIn = async (create = false) => {
    if (!client) { notify('Configure o Supabase primeiro.'); return; }
    const result = create ? await client.auth.signUp({ email: authEmail, password: authPassword }) : await client.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (result.error) notify(result.error.message); else { setSession(result.data.session); notify(create ? 'Conta criada. Confirme o e-mail, se solicitado.' : 'Sessão iniciada.'); }
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
    <header className="topbar"><div className="brand"><img className="brand-logo" src="/logo-pombal.jpeg" alt="Grupo Pedra do Pombal" /><span>Scanner Pombal</span></div><div className="topright"><span className={`status ${client && session ? 'online' : ''}`} /><span>{client ? session ? session.user.email : 'Entre para acessar seus PDFs' : 'Salvando neste dispositivo'}</span>{client && session && <button className="softbtn" onClick={() => client.auth.signOut()}>Sair</button>}<button className="iconbtn" title="Configurar Supabase" onClick={openSettings}><Icon name="settings" size={18} /></button></div></header>
    {client && !session && <section className="authbar"><strong>Entre para salvar seus documentos na nuvem</strong><input type="email" placeholder="Seu e-mail" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} /><input type="password" placeholder="Senha (mínimo de 6 caracteres)" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} /><button className="primary" onClick={() => signIn(false)}>Entrar</button><button className="softbtn" onClick={() => signIn(true)}>Criar conta</button></section>}
    <section className="hero"><div><div className="eyebrow">Seu scanner de bolso</div><h1>Digitalize. Guarde.<br />Compartilhe.</h1><p>Transforme suas folhas em PDFs organizados em segundos.</p></div><button className="newbtn" onClick={() => fileRef.current?.click()}><Icon name="plus" />Novo escaneamento</button></section>
    <main className="main">
      <section className="card scan-card"><div className="cardhead"><h2>Novo escaneamento</h2><span className="step">{pages.length} {pages.length === 1 ? 'página' : 'páginas'}</span></div>
        <div className={`drop ${dragging ? 'drag' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
          <div className="upload-icon"><Icon name="upload" size={24} /></div><strong>Adicione as páginas do documento</strong><p>Fotografe as páginas em sequência ou escolha imagens da galeria</p><div className="drop-actions"><button className="softbtn" onClick={() => fileRef.current?.click()}>Escolher fotos</button><button className="softbtn camera-btn" onClick={openCamera}><Icon name="camera" size={17} />Usar câmera</button></div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
        </div>
        {pages.length > 0 && <div className="thumbs">{pages.map((page, index) => <div className="thumb" key={`${page.name}-${index}`}><img src={previewImage(page)} alt={`Página ${index + 1}`} /><span>{index + 1}</span><button className="remove-page" aria-label="Remover página" onClick={() => removePage(index)}>×</button><button className="crop-adjust" onClick={() => openCropEditor(page, index)}>Ajustar</button></div>)}</div>}
        <div className="scan-footer"><span className="hint">{pdfPreparing ? 'Enquadrando e melhorando as páginas…' : pdfBlob ? scanNeedsCheck ? 'Use “Ajustar” na miniatura para alinhar os cantos.' : `Documento A4 pronto · ${pages.length} ${pages.length === 1 ? 'página' : 'páginas'}` : 'Você pode adicionar várias páginas ao mesmo PDF.'}</span><button className="primary" disabled={!pages.length || busy || pdfPreparing} onClick={() => { setSelectedPages(pages.map((_, i) => i)); setPreviewOpen(true); }}><Icon name="file" />{pdfPreparing ? 'Preparando…' : 'Revisar PDF'}</button></div>
      </section>
      <section className="card history"><div className="history-head"><h2>Seus documentos</h2><span className="count">{docs.length} {docs.length === 1 ? 'arquivo' : 'arquivos'}</span></div><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, categoria ou texto..." aria-label="Buscar documentos" />
        <div className="list">{filtered.length ? filtered.map((doc) => <div className="doc" key={doc.id}><div className="pdf-icon"><Icon name="file" /></div><div className="docinfo"><div className="docname" title={doc.name}>{doc.name}</div><div className="docmeta">{doc.category || 'Geral'} · {doc.pages} {doc.pages === 1 ? 'página' : 'páginas'} · {dateLabel(doc.created_at)}</div></div><div className="docactions"><button className="iconbtn" title="Renomear e categorizar" onClick={() => { setEditingDoc(doc); setEditName(doc.name); setEditCategory(doc.category || 'Geral'); }}>✎</button><button className="iconbtn" title="Baixar PDF" onClick={() => download(doc)}><Icon name="download" size={16} /></button><button className="iconbtn" title="Compartilhar PDF" onClick={() => share(doc)}><Icon name="whatsapp" size={16} /></button></div></div>) : <div className="empty"><div className="upload-icon"><Icon name="file" /></div><strong>{query ? 'Nenhum resultado' : 'Seu histórico começa aqui'}</strong>{query ? 'Tente buscar por outro termo.' : 'Os PDFs que você criar aparecerão aqui.'}</div>}</div>
        <div className="syncbox"><span className={`status ${client && session ? 'online' : ''}`} /><div><strong>{client ? session ? 'Histórico privado no Supabase' : 'Acesso privado' : 'Histórico neste dispositivo'}</strong><span>{client ? session ? 'Somente sua conta pode acessar seus documentos.' : 'Entre ou crie uma conta para ver e salvar documentos.' : 'Configure o Supabase para sincronizar em uma conta.'}</span></div></div>
      </section>
    </main><div className="footnote">Seus documentos ficam organizados com segurança no seu histórico.</div>
    {cameraOpen && <div className="modalback camera-backdrop"><section className="camera-modal" role="dialog" aria-modal="true" aria-labelledby="camera-title"><header className="camera-head"><div><h2 id="camera-title">Enquadre a folha</h2><p>{pages.length} {pages.length === 1 ? 'página capturada' : 'páginas capturadas'} · mantenha os quatro cantos visíveis</p></div><button className="iconbtn" onClick={closeCamera} aria-label="Fechar câmera">×</button></header>{cameraStream ? <div className="camera-stage" style={{ aspectRatio: cameraAspect, width: `min(100%, ${cameraAspect * 58}vh)` }}><video className="camera-view" ref={videoRef} onLoadedMetadata={(event) => setCameraAspect(event.currentTarget.videoWidth / event.currentTarget.videoHeight)} autoPlay playsInline muted /><div className="crop-frame" style={(() => { const h = 90; const w = Math.min(88, (Math.SQRT1_2 * h) / cameraAspect * 100); return { width: `${w}%`, height: `${h}%`, left: `${(100-w)/2}%`, top: '5%' }; })()}><i /><i /><i /><i /></div></div> : <div className="camera-placeholder"><Icon name="camera" size={34} /><span>{cameraError || 'Iniciando câmera…'}</span></div>}{cameraError && cameraStream && <p className="camera-error">{cameraError}</p>}<div className="camera-help">O scanner localiza as bordas da folha. Depois da captura, toque em Ajustar para alinhar os cantos manualmente se necessário.</div><div className="camera-actions"><button className="softbtn" onClick={closeCamera}>Cancelar</button><button className="primary capture-btn" disabled={!cameraStream} onClick={capturePage}><Icon name="camera" size={18} />Capturar página</button><button className="primary finish-btn" disabled={!pages.length || pdfPreparing || busy} onClick={finishCamera}>{busy ? 'Salvando…' : pdfPreparing ? 'Preparando PDF…' : `Concluir e criar PDF (${pages.length})`}</button></div></section></div>}
    {cropEditor && <div className="modalback camera-backdrop"><section className="camera-modal crop-editor-modal" role="dialog" aria-modal="true" aria-labelledby="crop-title"><header className="camera-head"><div><h2 id="crop-title">Ajustar enquadramento</h2><p>Arraste os quatro pontos para os cantos do papel.</p></div><button className="iconbtn" onClick={closeCropEditor} aria-label="Fechar ajuste">×</button></header><div className="crop-editor-stage" style={{ aspectRatio: cropEditor.aspect, width: `min(100%, ${cropEditor.aspect * 58}vh)` }}><img src={cropEditor.previewUrl} alt="Foto para ajustar" /><svg ref={cropSvgRef} viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerMove={moveCropCorner} onPointerUp={() => setDragCorner(null)} onPointerCancel={() => setDragCorner(null)}><polygon points={cropCorners.map(({ x, y }) => `${x},${y}`).join(' ')} />{cropCorners.map(({ x, y }, index) => <circle key={index} cx={x} cy={y} r="24" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.ownerSVGElement.setPointerCapture(event.pointerId); setDragCorner(index); }} />)}</svg></div><div className="camera-help">Posicione cada ponto no canto correspondente da folha. O conteúdo fora do contorno será removido e a perspectiva corrigida.</div><div className="camera-actions"><button className="softbtn" onClick={restoreAutoCrop}>Restaurar automático</button><button className="softbtn" onClick={closeCropEditor}>Cancelar</button><button className="primary" onClick={saveCropCorners}>Aplicar enquadramento</button></div></section></div>}
    {previewOpen && <div className="modalback camera-backdrop"><section className="camera-modal preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title"><header className="camera-head"><div><h2 id="preview-title">Revisar documento</h2><p>Reordene ou remova páginas antes de salvar.</p></div><button className="iconbtn" onClick={() => setPreviewOpen(false)}>×</button></header><div className="preview-fields"><label>Nome do PDF<input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Ex.: Relatório de visita" /></label><label>Categoria<input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Geral" /></label><label>Tratamento<select value={scanFilter} onChange={(e) => setScanFilter(e.target.value)}><option value="document">Documento nítido</option><option value="grayscale">Escala de cinza</option><option value="color">Colorido</option></select></label></div><div className="preview-pages">{pages.map((page, index) => <div className="preview-page" key={`${page.name}-${index}`}><img src={previewImage(page)} alt={`Página ${index + 1}`} /><div><label><input type="checkbox" checked={selectedPages.includes(index)} onChange={(e) => setSelectedPages((curr) => e.target.checked ? [...curr, index] : curr.filter((n) => n !== index))} /> Compartilhar</label><button className="softbtn" disabled={index === 0} onClick={() => movePage(index, -1)}>↑</button><button className="softbtn" disabled={index === pages.length - 1} onClick={() => movePage(index, 1)}>↓</button><button className="softbtn" onClick={() => removePage(index)}>Remover</button></div></div>)}</div><div className="preview-toolbar"><button className="softbtn" onClick={recognizeText} disabled={ocrBusy}>{ocrBusy ? 'Reconhecendo…' : 'Reconhecer texto (OCR)'}</button>{ocrText && <button className="softbtn" onClick={copyOcrText}>Copiar texto</button>}<button className="softbtn" onClick={shareSelected}>Compartilhar selecionadas</button></div>{ocrText && <textarea className="ocr-result" value={ocrText} onChange={(e) => setOcrText(e.target.value)} aria-label="Texto reconhecido" />}<div className="preview-toolbar"><span className="hint">{pdfPreparing ? 'Atualizando PDF…' : 'Prévia em papel A4'}</span><button className="primary" disabled={!pages.length || pdfPreparing || busy || (client && !session)} onClick={makePdf}>{busy ? 'Salvando…' : client && !session ? 'Entre para salvar' : 'Salvar no histórico'}</button></div>{pdfBlob && <iframe className="pdf-preview" title="Prévia do documento PDF" src={pdfPreviewUrl} />}</section></div>}
    {editingDoc && <div className="modalback"><section className="modal"><h2>Editar documento</h2><label>Nome<input value={editName} onChange={(e) => setEditName(e.target.value)} /></label><label>Categoria<input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} /></label><div className="modalbuttons"><button className="softbtn" onClick={() => setEditingDoc(null)}>Cancelar</button><button className="primary" onClick={saveEdit}>Salvar</button></div></section></div>}
    {modal && <div className="modalback"><section className="modal"><h2>Configurar Supabase</h2><p>Informe a URL do projeto e a chave pública anon.</p><label>URL do projeto<input value={urlField} onChange={(e) => setUrlField(e.target.value)} /></label><label>Chave pública<input value={keyField} onChange={(e) => setKeyField(e.target.value)} /></label><div className="modalbuttons"><button className="softbtn" onClick={() => { setModal(false); disconnect(); }}>Desconectar</button><button className="softbtn" onClick={() => setModal(false)}>Cancelar</button><button className="primary" onClick={saveSettings}>Conectar</button></div></section></div>}
    {toast && <div className="message show" role="status">{toast}</div>}
  </div>;
}

export default App;
