import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useParams
} from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Eye,
  FileCheck2,
  FileText,
  FileWarning,
  Gavel,
  Highlighter,
  Hourglass,
  KeyRound,
  Layers3,
  Lock,
  Menu,
  PanelLeftClose,
  Play,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  ScrollText,
  Send,
  ShieldCheck,
  Stamp,
  Tags,
  UploadCloud,
  UserCog
} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Badge, Button, Card, Dialog, Tabs, X } from './components/ui';
import {
  REVIEW_CHECKS,
  USERS,
  batchStatus,
  canViewDoc,
  docStatus,
  isReviewActive,
  requiredSignatures,
  useDisclosureStore,
  type Classification,
  type DisclosureRecord,
  type ReleaseBatch
} from './store';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const classTone = (level: Classification): 'red' | 'amber' | 'neutral' =>
  level === '严格机密' ? 'red' : level === '机密' ? 'amber' : 'neutral';

const statusTone = (status: string): 'red' | 'amber' | 'green' | 'blue' | 'neutral' => {
  switch (status) {
    case '可发布':
    case '已完成':
      return 'green';
    case '待质检':
    case '待导出':
      return 'amber';
    case '导出中':
    case '去密中':
      return 'blue';
    case '复核失效':
    case '隔离待复核':
    case '导出失败':
      return 'red';
    case '退回等待':
      return 'amber';
    default:
      return 'neutral';
  }
};

const bundleQuery = async () => ({
  queue: [
    { id: 'Q-31', name: '第三批补充材料', count: 128, owner: '林清', progress: 68, due: '今日 16:00' },
    { id: 'Q-32', name: '证人材料图像件', count: 47, owner: '周叙', progress: 34, due: '明日 11:00' },
    { id: 'Q-33', name: '专家报告附件', count: 19, owner: '顾言', progress: 91, due: '09-30 18:00' }
  ]
});

/* ============================== 外壳与通知 ============================== */

function Toast() {
  const notice = useDisclosureStore((s) => s.notice);
  const clearNotice = useDisclosureStore((s) => s.clearNotice);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(clearNotice, 5200);
    return () => clearTimeout(timer);
  }, [notice, clearNotice]);
  if (!notice) return null;
  return (
    <div className={`toast ${notice.tone}`} role="status">
      {notice.tone === 'deny' ? <Ban size={16} /> : notice.tone === 'ok' ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
      <span>{notice.text}</span>
      <button onClick={clearNotice} aria-label="关闭"><X size={13} /></button>
    </div>
  );
}

function UserSwitcher() {
  const currentUserId = useDisclosureStore((s) => s.currentUserId);
  const switchUser = useDisclosureStore((s) => s.switchUser);
  const resetDemo = useDisclosureStore((s) => s.resetDemo);
  return (
    <div className="user-switcher">
      <UserCog size={15} />
      <select value={currentUserId} onChange={(e) => switchUser(e.target.value)} title="切换当前操作人（演示权限差异）">
        {USERS.map((u) => (
          <option key={u.id} value={u.id}>{u.name} · {u.role} · {u.clearance}</option>
        ))}
      </select>
      <Button variant="ghost" className="reset-btn" onClick={resetDemo} title="重置演示数据"><RotateCcw size={14} /></Button>
    </div>
  );
}

function AppShell() {
  const [mobileNav, setMobileNav] = useState(false);
  const links = [
    { to: '/', label: '文档集', icon: Layers3 },
    { to: '/review/$documentId', label: '去密审阅', icon: Highlighter },
    { to: '/quality', label: '复核与裁决', icon: ScanSearch },
    { to: '/batches', label: '发布批次', icon: Tags }
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-symbol"><Stamp size={18} /></div>
          <div><strong>披露质控台</strong><span>North Ridge / Litigation Support</span></div>
        </div>
        <div className="top-actions">
          <UserSwitcher />
          <div className="operator"><span>统一授权依据 · 版本化门禁</span><strong>密级 / 区域 / 复核 / 批次 共用一据</strong></div>
        </div>
        <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="菜单"><Menu /></button>
      </header>
      <div className="shell-body">
        <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
          <div className="workspace-title">
            <span>当前工作区</span>
            <strong>北岭项目 · 诉讼披露</strong>
          </div>
          <nav>
            {links.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to as '/'} activeProps={{ className: 'active' }} onClick={() => setMobileNav(false)}>
                <Icon size={17} /> <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div><KeyRound size={16} /><span>越权查看 / 修改 / 导出一律拒绝留痕</span></div>
            <small>所有操作依据同一授权版本，草稿保存在本机</small>
          </div>
        </aside>
        <main className="main-content"><Outlet /></main>
      </div>
      <Toast />
    </div>
  );
}

/* ============================== 文档集 ============================== */

function DocumentsPage() {
  const documents = useDisclosureStore((state) => state.documents);
  const reviews = useDisclosureStore((state) => state.reviews);
  const audits = useDisclosureStore((state) => state.audits);
  const currentUserId = useDisclosureStore((state) => state.currentUserId);
  const selectDocument = useDisclosureStore((state) => state.selectDocument);
  const navigate = useNavigate();
  const actor = USERS.find((u) => u.id === currentUserId)!;
  const { data } = useQuery({ queryKey: ['document-queues'], queryFn: bundleQuery });
  const [filter, setFilter] = useState('全部');
  const decorated = documents.map((doc) => ({ doc, status: docStatus(doc, reviews[doc.id]), visible: canViewDoc(actor, doc) }));
  const visible = filter === '全部' ? decorated : decorated.filter((item) => item.status === filter);
  const openDoc = (doc: DisclosureRecord) => {
    const result = selectDocument(doc.id);
    if (result.ok) navigate({ to: '/review/$documentId', params: { documentId: doc.id } });
  };
  return (
    <div className="page">
      <header className="page-heading">
        <div><small>DISCLOSURE CONTROL / DOCUMENT SET</small><h1>披露文档集</h1><p>密级、去密区域、复核结论与发布批次共用同一条授权依据；无密级材料不在此呈现。</p></div>
        <Button><UploadCloud size={16} /> 导入文档集</Button>
      </header>
      <section className="summary-strip">
        <div><span>文档总数</span><strong>{documents.length}</strong><small>授权可见 {decorated.filter((i) => i.visible).length} 份</small></div>
        <div><span>去密区域</span><strong>{documents.reduce((n, d) => n + d.redactions.length, 0)}</strong><small>确认 {documents.reduce((n, d) => n + d.redactions.filter((r) => r.status === 'confirmed').length, 0)}</small></div>
        <div><span>复核失效</span><strong className="warning-text">{decorated.filter((i) => i.status === '复核失效').length}</strong><small>依据升级后须重审</small></div>
        <div><span>可发布</span><strong>{decorated.filter((i) => i.status === '可发布').length}</strong><small>签名与快照齐备</small></div>
      </section>
      <div className="two-column">
        <Card className="document-table-card">
          <div className="card-heading">
            <div><Tabs.Root value={filter} onValueChange={setFilter}><Tabs.List className="segmented">
              {['全部', '去密中', '待质检', '复核失效', '可发布'].map((item) => <Tabs.Trigger key={item} value={item}>{item}</Tabs.Trigger>)}
            </Tabs.List></Tabs.Root></div>
            <span>{visible.length} 份文档 · 当前 {actor.name}（{actor.clearance}）</span>
          </div>
          <div className="document-table">
            {visible.map(({ doc, status, visible: canView }) => (
              <div className={`document-row ${canView ? '' : 'locked-row'}`} key={doc.id}>
                <div className="file-icon">{canView ? <FileText size={19} /> : <Lock size={17} />}</div>
                <div className="doc-main">
                  <strong>{canView ? doc.title : `无权查看的${doc.basis.classification}材料`}</strong>
                  <span>{doc.id} · {canView ? doc.bundle : '内容已按密级屏蔽'} · {canView ? doc.size : '—'}</span>
                </div>
                <div className="doc-field"><span>密级 / 依据</span><Badge tone={classTone(doc.basis.classification)}>{doc.basis.classification} · v{doc.basis.version}</Badge></div>
                <div className="doc-field"><span>负责人员</span><strong>{canView ? doc.owner : '—'}</strong></div>
                <div className="doc-field"><span>状态</span><Badge tone={statusTone(status)}>{status}</Badge></div>
                <div className="doc-actions">
                  {canView ? (
                    <Link to="/review/$documentId" params={{ documentId: doc.id }} onClick={() => selectDocument(doc.id)}><Button variant="outline">审阅</Button></Link>
                  ) : (
                    <Button variant="outline" className="denied-btn" onClick={() => openDoc(doc)}><Ban size={13} /> 拒绝查看</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <aside className="side-stack">
          <Card className="queue-card">
            <div className="card-title"><ClipboardCheck size={17} /><strong>去密任务队列</strong></div>
            {(data?.queue ?? []).map((item) => (
              <div className="queue-item" key={item.id}>
                <div><strong>{item.name}</strong><span>{item.count} 份 · {item.owner}</span></div>
                <div className="progress"><i style={{ width: `${item.progress}%` }} /></div>
                <small>{item.progress}% · 截止 {item.due}</small>
              </div>
            ))}
          </Card>
          <Card className="audit-card">
            <div className="card-title"><ScrollText size={17} /><strong>授权审计账</strong><span>{audits.filter((a) => a.result === '拒绝').length} 次拒绝</span></div>
            <div className="audit-list">
              {audits.slice(0, 12).map((entry) => (
                <p key={entry.id} className={entry.result === '拒绝' ? 'audit-deny' : entry.result === '系统' ? 'audit-system' : ''}>
                  <b>{entry.at}</b>
                  <Badge tone={entry.result === '拒绝' ? 'red' : entry.result === '系统' ? 'amber' : 'green'}>{entry.result}</Badge>
                  <span className="audit-line">{entry.actorName} · {entry.action} · {entry.target}</span>
                  <small>{entry.detail}</small>
                </p>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ============================== PDF 演示 ============================== */

function useDemoPdf() {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  useEffect(() => {
    let alive = true;
    PDFDocument.create().then(async (pdf) => {
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (let pageNo = 1; pageNo <= 3; pageNo += 1) {
        const page = pdf.addPage([612, 792]);
        page.drawText(`NORTH RIDGE PROJECT - DISCLOSURE EXHIBIT`, { x: 54, y: 728, size: 14, font, color: rgb(0.12, 0.16, 0.2) });
        page.drawText(`Document page ${pageNo} / 3`, { x: 54, y: 704, size: 10, font, color: rgb(0.35, 0.39, 0.43) });
        page.drawLine({ start: { x: 54, y: 690 }, end: { x: 558, y: 690 }, thickness: 1, color: rgb(0.75, 0.78, 0.8) });
        const lines = [
          'Commercial terms and operational records',
          'Parties: North Ridge Equipment Co. and Haiyang Logistics',
          'Reference No. NR-2026-0819 / Confidentiality class: strictly confidential',
          '',
          'The supplier shall provide maintenance records, operating data and',
          'incident reports within ten business days after each quarterly review.',
          '',
          'Contact: [redacted personal information]',
          'Commercial consideration: [redacted third-party quotation]',
          '',
          'This copy is prepared solely for disclosure review. Every marked region',
          'must be confirmed against the original before approval and release.'
        ];
        lines.forEach((line, index) => page.drawText(line, { x: 54, y: 655 - index * 24, size: 10, font, color: rgb(0.1, 0.13, 0.16) }));
        page.drawText(`Control stamp: REVIEW-${String(pageNo).padStart(2, '0')}`, { x: 54, y: 72, size: 9, font, color: rgb(0.5, 0.53, 0.56) });
      }
      return pdf.save();
    }).then((data) => {
      if (alive) {
        const copy = new Uint8Array(data);
        setBytes(copy.buffer as ArrayBuffer);
      }
    });
    return () => { alive = false; };
  }, []);
  return bytes;
}

function PdfPage({ pageNumber, redacted = false, onDraw }: { pageNumber: number; redacted?: boolean; onDraw?: (region: { x: number; y: number; width: number; height: number }) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bytes = useDemoPdf();
  const [drawing, setDrawing] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const start = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!bytes || !canvasRef.current) return;
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    const render = async () => {
      task = pdfjs.getDocument({ data: bytes.slice(0) });
      const pdf = await task.promise;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = canvasRef.current!;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = viewport.width * ratio;
      canvas.height = viewport.height * ratio;
      canvas.style.width = '100%';
      canvas.style.aspectRatio = `${viewport.width}/${viewport.height}`;
      const context = canvas.getContext('2d')!;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
    };
    render().catch(console.error);
    return () => { task?.destroy(); };
  }, [bytes, pageNumber]);

  const pointerDown = (event: React.PointerEvent) => {
    if (!onDraw) return;
    const rect = event.currentTarget.getBoundingClientRect();
    start.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDrawing({ x: start.current.x / rect.width, y: start.current.y / rect.height, width: 0, height: 0 });
  };
  const pointerMove = (event: React.PointerEvent) => {
    if (!drawing || !onDraw) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(start.current.x, event.clientX - rect.left) / rect.width;
    const y = Math.min(start.current.y, event.clientY - rect.top) / rect.height;
    const width = Math.abs(event.clientX - rect.left - start.current.x) / rect.width;
    const height = Math.abs(event.clientY - rect.top - start.current.y) / rect.height;
    setDrawing({ x, y, width, height });
  };
  const pointerUp = () => {
    if (drawing && onDraw && drawing.width > 0.015 && drawing.height > 0.01) onDraw(drawing);
    setDrawing(null);
  };
  return (
    <div className={`pdf-page ${onDraw ? 'drawable' : ''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
      <canvas ref={canvasRef} />
      {redacted && <div className="page-redaction-demo"><span>已发布区域掩码</span></div>}
      {drawing && <i className="drawing-region" style={{ left: `${drawing.x * 100}%`, top: `${drawing.y * 100}%`, width: `${drawing.width * 100}%`, height: `${drawing.height * 100}%` }} />}
    </div>
  );
}

/* ============================== 无权查看面板 ============================== */

function DeniedPanel({ doc, reason }: { doc: DisclosureRecord; reason: string }) {
  const navigate = useNavigate();
  return (
    <div className="page denied-page">
      <Card className="denied-card">
        <Ban size={30} />
        <h1>无权查看该材料</h1>
        <p>{reason}</p>
        <p className="muted">文档 {doc.id} 为{doc.basis.classification}（授权依据 v{doc.basis.version}）。本次拒绝已写入授权审计账，标题、区域与正文均不呈现。</p>
        <div className="denied-actions">
          <Button variant="outline" onClick={() => navigate({ to: '/' })}><ArrowLeft size={15} /> 返回文档集</Button>
        </div>
      </Card>
    </div>
  );
}

/* ============================== 去密审阅 ============================== */

function ReviewPage() {
  const { documentId } = useParams({ from: '/review/$documentId' });
  const navigate = useNavigate();
  const documents = useDisclosureStore((s) => s.documents);
  const reviews = useDisclosureStore((s) => s.reviews);
  const currentUserId = useDisclosureStore((s) => s.currentUserId);
  const store = useDisclosureStore();
  const actor = USERS.find((u) => u.id === currentUserId)!;
  const doc = documents.find((item) => item.id === documentId) ?? documents[0];
  const review = reviews[doc.id];
  const allowed = canViewDoc(actor, doc);
  const attempted = useRef(false);
  useEffect(() => {
    if (!allowed && !attempted.current) {
      attempted.current = true;
      store.selectDocument(doc.id); // 拒绝并留审计
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, doc.id]);

  const { activePage, redactionMode, activeRedactionId } = useDisclosureStore();
  const pageRegions = doc.redactions.filter((item) => item.page === activePage);
  const active = doc.redactions.find((item) => item.id === activeRedactionId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('商业秘密');
  const [privilege, setPrivilege] = useState('合同保密');
  const reviewActive = isReviewActive(doc, review);
  const canEdit = allowed && actor.role !== '发布员';

  if (!allowed) {
    return <DeniedPanel doc={doc} reason={`${actor.name} 的授权密级为${actor.clearance}，低于文档密级${doc.basis.classification}。`} />;
  }

  return (
    <div className="page review-page">
      <header className="review-header">
        <div className="review-title">
          <Button variant="ghost" onClick={() => navigate({ to: '/' })}><ArrowLeft size={16} /></Button>
          <div><small>{doc.id} / 去密审阅 / 依据 v{doc.basis.version}</small><h1>{doc.title}</h1></div>
          <Badge tone={classTone(doc.basis.classification)}>{doc.basis.classification}</Badge>
          {review && !reviewActive && <Badge tone="red">复核失效（v{review.basisVersion} → v{doc.basis.version}）</Badge>}
          {reviewActive && <Badge tone="blue">复核占用中 {review.signatures.length}/{requiredSignatures(doc)}</Badge>}
        </div>
        <div className="review-actions">
          <Button variant="outline" onClick={() => store.toggleRedactionMode()} className={redactionMode ? 'active-button' : ''}><Highlighter size={16} /> {redactionMode ? '取消绘制' : '绘制去密区'}</Button>
          <Button variant="outline" onClick={() => setDialogOpen(true)}><FileCheck2 size={16} /> 依据校验</Button>
          <Button onClick={() => navigate({ to: '/quality' })}><Send size={16} /> 提交复核结论</Button>
        </div>
      </header>
      <div className="basis-strip">
        <div><span>授权依据</span><strong>v{doc.basis.version}</strong></div>
        <div><span>最近变更</span><strong>{doc.basis.changeNote}</strong></div>
        <div><span>变更时间</span><strong>{doc.basis.changedAt}</strong></div>
        <div className={canEdit ? 'basis-ok' : 'basis-deny'}><span>当前操作人</span><strong>{actor.name} · {canEdit ? '可修改' : '只读（无权修改）'}</strong></div>
      </div>
      <div className="review-layout">
        <aside className="page-thumbs">
          <div className="side-label">页级预览 <span>{doc.pages} 页</span></div>
          {[1, 2, 3].map((page) => (
            <button key={page} className={activePage === page ? 'active' : ''} onClick={() => store.setPage(page)}>
              <div className="mini-page"><span>{page}</span><i style={{ width: `${45 + page * 9}%` }} /><i style={{ width: `${70 - page * 5}%` }} /><i style={{ width: `${55 + page * 4}%` }} /></div>
              <small>第 {page} 页</small>
            </button>
          ))}
        </aside>
        <section className="viewer-column">
          <div className="viewer-toolbar">
            <div><button onClick={() => store.setPage(Math.max(1, activePage - 1))} disabled={activePage === 1}><ChevronLeft size={16} /></button><strong>{activePage} / {doc.pages}</strong><button onClick={() => store.setPage(Math.min(doc.pages, activePage + 1))} disabled={activePage === doc.pages}><ChevronRight size={16} /></button></div>
            <span>125%</span>
            <span>原页 · 掩码叠加</span>
          </div>
          <div className="pdf-stage">
            <PdfPage
              pageNumber={activePage}
              onDraw={redactionMode ? (region) => store.addRedaction({ ...region, page: activePage, reason, privilege }) : undefined}
            />
            {pageRegions.map((region) => (
              <button
                key={region.id}
                className={`redaction-region ${region.status} ${activeRedactionId === region.id ? 'selected' : ''}`}
                style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}
                onClick={() => store.selectRedaction(region.id)}
                title={`${region.reason} / ${region.privilege}`}
              />
            ))}
          </div>
        </section>
        <aside className="inspector">
          <div className="side-label">区域属性 / 授权依据 v{doc.basis.version}</div>
          {active ? (
            <>
              <div className="inspector-title"><strong>{active.reason}</strong><Badge tone={active.status === 'confirmed' ? 'green' : 'amber'}>{active.status === 'confirmed' ? '已确认' : '草稿'}</Badge></div>
              <label>保密级别<select value={doc.basis.classification} disabled={!canEdit} onChange={(event) => store.updateClassification(event.target.value as Classification)}><option>内部</option><option>机密</option><option>严格机密</option></select></label>
              <label>去密原因<input value={active.reason} readOnly /></label>
              <label>特权标签<input value={active.privilege} readOnly /></label>
              <label>责任人员<input value={doc.owner} readOnly /></label>
              <div className="coordinate-grid"><div><span>X</span><b>{Math.round(active.x * 100)}%</b></div><div><span>Y</span><b>{Math.round(active.y * 100)}%</b></div><div><span>宽</span><b>{Math.round(active.width * 100)}%</b></div><div><span>高</span><b>{Math.round(active.height * 100)}%</b></div></div>
              <Button onClick={() => store.confirmRedaction(active.id)} disabled={!canEdit || active.status === 'confirmed'}><Check size={15} /> 确认此区域</Button>
              <Button variant="outline" disabled={!canEdit}><Copy size={15} /> 批量复制到同类页</Button>
            </>
          ) : <p className="muted">在文档页面上选择一个去密区域查看属性。{!canEdit && '你当前无权修改该文档。'}</p>}
          <div className="rule-note"><AlertTriangle size={16} /><span>密级或区域一经变化，授权依据升级：本页复核结论立即失效、待导出批次退回等待，其他文档不受影响。</span></div>
          {review && (
            <div className={`basis-signatures ${reviewActive ? '' : 'stale'}`}>
              <div className="side-label">已接受复核 {reviewActive ? `（依据 v${review.basisVersion}）` : `（原 v${review.basisVersion} 已失效）`}</div>
              {review.signatures.map((s) => (
                <div className="sig-row" key={s.reviewerId + s.at}><Check size={13} /><div><strong>{s.reviewerName} · {s.conclusion}</strong><small>{s.at} · {s.note}</small></div></div>
              ))}
            </div>
          )}
        </aside>
      </div>
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>授权依据校验</Dialog.Title>
            <Dialog.Description>密级、区域、复核结论、发布批次以同一依据版本对齐，批次只认加入时的密级快照。</Dialog.Description>
            <div className="dialog-checks">
              <p><Check /> 当前依据 v{doc.basis.version}：{doc.basis.changeNote}</p>
              <p><Check /> {doc.redactions.length} 个去密区域已定位</p>
              <p className={doc.redactions.some((item) => item.status === 'draft') ? 'failed' : ''}><AlertTriangle /> {doc.redactions.some((item) => item.status === 'draft') ? '仍有未确认区域' : '所有区域已确认'}</p>
              <p className={reviewActive ? '' : 'failed'}><AlertTriangle /> {reviewActive ? `复核结论基于当前依据（${review!.signatures.length}/${requiredSignatures(doc)} 签名）` : '复核结论基于旧依据，已失效'}</p>
            </div>
            <Dialog.Close asChild><Button>返回检查 <X size={15} /></Button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/* ============================== 复核、双人提交与待裁决账 ============================== */

function ArbitrationLedger({ docId }: { docId: string }) {
  const arbitrations = useDisclosureStore((s) => s.arbitrations);
  const currentUserId = useDisclosureStore((s) => s.currentUserId);
  const documents = useDisclosureStore((s) => s.documents);
  const adjudicate = useDisclosureStore((s) => s.adjudicate);
  const actor = USERS.find((u) => u.id === currentUserId)!;
  const entries = arbitrations.filter((e) => e.docId === docId);
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (entries.length === 0) return null;
  return (
    <Card className="arbitration-card">
      <div className="card-title"><Gavel size={17} /><strong>待裁决账</strong><span>先提交者占用依据，后到差异不覆盖</span></div>
      {entries.map((entry) => {
        const doc = documents.find((d) => d.id === entry.docId)!;
        const canRule = actor.role === '复核员' && actor.clearance !== '内部' && actor.id !== entry.reviewerId && canRuleEntry(actor, doc);
        return (
          <div className={`arb-entry ${entry.status !== '待裁决' ? 'resolved' : ''}`} key={entry.id}>
            <div className="arb-head">
              <strong>{entry.reviewerName} 的差异提交</strong>
              <Badge tone={entry.status === '待裁决' ? 'amber' : entry.status === '已采纳' ? 'green' : 'neutral'}>{entry.status}</Badge>
            </div>
            <small>{entry.createdAt} · 针对依据 v{entry.basisVersion} · 结论{entry.conclusion}</small>
            <p>{entry.note}</p>
            {entry.region && <p className="arb-region"><Highlighter size={13} /> 附带区域建议：第 {entry.region.page} 页「{entry.region.reason} / {entry.region.privilege}」</p>}
            {entry.status === '待裁决' ? (
              actor.id === entry.reviewerId ? (
                <p className="muted">提交人不能裁决自己的条目，请切换其他复核员（如沈律）。</p>
              ) : (
                <div className="arb-rule">
                  <input placeholder="裁决理由（必填）" value={notes[entry.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [entry.id]: e.target.value }))} />
                  <div className="arb-actions">
                    <Button variant="outline" disabled={!canRule} onClick={() => adjudicate(entry.id, '驳回', notes[entry.id] ?? '')}><Ban size={14} /> 驳回（维持原结论）</Button>
                    <Button disabled={!canRule} onClick={() => adjudicate(entry.id, '采纳', notes[entry.id] ?? '')}><Check size={14} /> 采纳（依据升级）</Button>
                  </div>
                  {!canRule && actor.role === '复核员' && <small className="warn-small">你无权裁决该密级文档，或你就是提交人。</small>}
                </div>
              )
            ) : (
              <small className="muted">裁决人 {entry.ruledByName} · {entry.ruledAt} · {entry.rulingNote}</small>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function canRuleEntry(actor: { clearance: Classification }, doc: DisclosureRecord): boolean {
  const order: Classification[] = ['内部', '机密', '严格机密'];
  return order.indexOf(actor.clearance) >= order.indexOf(doc.basis.classification);
}

function QualityPage() {
  const documents = useDisclosureStore((s) => s.documents);
  const reviews = useDisclosureStore((s) => s.reviews);
  const currentUserId = useDisclosureStore((s) => s.currentUserId);
  const activeDocumentId = useDisclosureStore((s) => s.activeDocumentId);
  const store = useDisclosureStore();
  const actor = USERS.find((u) => u.id === currentUserId)!;
  const doc = documents.find((d) => d.id === activeDocumentId) ?? documents[0];
  const allowed = canViewDoc(actor, doc);
  const review = reviews[doc.id];
  const reviewActive = isReviewActive(doc, review);
  const status = docStatus(doc, review);

  const [conclusion, setConclusion] = useState<'通过' | '退回补件'>('通过');
  const [note, setNote] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean>>(() => REVIEW_CHECKS.reduce<Record<string, boolean>>((a, c) => ({ ...a, [c.id]: false }), {}));
  const [attachRegion, setAttachRegion] = useState(false);
  const [regionReason, setRegionReason] = useState('银行账号');

  useEffect(() => {
    setNote('');
    setConclusion('通过');
    setChecks(review && isReviewActive(doc, review) ? { ...review.checks } : REVIEW_CHECKS.reduce<Record<string, boolean>>((a, c) => ({ ...a, [c.id]: false }), {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.basis.version, currentUserId]);

  const submit = () => {
    const result = store.submitReview({
      conclusion,
      note,
      checks,
      region: attachRegion
        ? { page: 3, x: 0.1, y: 0.12, width: 0.42, height: 0.05, reason: regionReason, privilege: '财务信息' }
        : undefined
    });
    if (result.ok) setNote('');
  };

  return (
    <div className="page">
      <header className="page-heading">
        <div><small>QUALITY ASSURANCE / DUAL REVIEW</small><h1>复核结论与并发裁决</h1><p>同一文档两名复核员同时提交：先提交者占用授权依据，后到差异进入待裁决账，不能覆盖已接受内容。</p></div>
      </header>
      <div className="doc-chooser">
        {documents.map((item) => {
          const canView = canViewDoc(actor, item);
          const st = docStatus(item, reviews[item.id]);
          return (
            <button key={item.id} className={item.id === doc.id && allowed ? 'active' : ''} onClick={() => store.selectDocument(item.id)}>
              {canView ? <FileText size={15} /> : <Lock size={14} />}
              <span>{canView ? item.title : `${item.id}（无权）`}</span>
              <Badge tone={statusTone(st)}>{st}</Badge>
            </button>
          );
        })}
      </div>
      {!allowed ? (
        <DeniedPanel doc={doc} reason={`${actor.name}（${actor.clearance}）无权查看${doc.basis.classification}材料，复核操作已拒绝并留审计。`} />
      ) : (
        <>
          <div className="comparison-banner">
            <div><Eye size={17} /><strong>{doc.title}</strong><span>{doc.id} · 依据 v{doc.basis.version} · {doc.basis.classification} · 签名 {reviewActive ? `${review!.signatures.length}/${requiredSignatures(doc)}` : '0 起算'}</span></div>
            <Badge tone={statusTone(status)}>{status}</Badge>
          </div>
          <div className="compare-grid">
            <Card className="compare-panel"><div className="compare-head"><span>原始页</span><Badge tone="neutral">源文件</Badge></div><div className="compare-page"><PdfPage pageNumber={1} /></div></Card>
            <Card className="compare-panel"><div className="compare-head"><span>发布页</span><Badge tone="green">已遮蔽</Badge></div><div className="compare-page redacted-preview"><PdfPage pageNumber={1} redacted /><div className="demo-mask mask-one" /><div className="demo-mask mask-two" /></div></Card>
          </div>
          <div className="quality-bottom quality-bottom-wide">
            <Card className="checks-card">
              <div className="card-title"><ClipboardCheck size={17} /><strong>发布前校验项</strong></div>
              {REVIEW_CHECKS.map((check) => (
                <button className="check-row" key={check.id} onClick={() => setChecks((c) => ({ ...c, [check.id]: !c[check.id] }))}>
                  <span className={checks[check.id] ? 'checked' : ''}>{checks[check.id] && <Check size={13} />}</span>
                  <div><strong>{check.label}</strong><small>{check.detail}</small></div>
                </button>
              ))}
              <label className="attach-region"><input type="checkbox" checked={attachRegion} onChange={(e) => setAttachRegion(e.target.checked)} /> 附带一条新的去密区域建议（将与既有结论产生差异）
                <select value={regionReason} disabled={!attachRegion} onChange={(e) => setRegionReason(e.target.value)}>
                  {['银行账号', '身份证号', '内部法律意见'].map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
            </Card>
            <Card className="decision-card">
              <div className="card-title"><FileCheck2 size={17} /><strong>提交复核结论</strong><span>{actor.name} · {actor.role}</span></div>
              {review && !reviewActive && (
                <div className="invalid-banner"><AlertTriangle size={15} /> 已接受复核基于旧依据 v{review.basisVersion}，当前为 v{doc.basis.version}，原结论已失效，本次提交将重新占用依据。</div>
              )}
              <div className="conclusion-switch">
                <button className={conclusion === '通过' ? 'active' : ''} onClick={() => setConclusion('通过')}>通过</button>
                <button className={conclusion === '退回补件' ? 'active reject' : ''} onClick={() => setConclusion('退回补件')}>退回补件</button>
              </div>
              <textarea className="review-note" placeholder="复核理由（必填，将作为授权依据的一部分）" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="decision-actions decision-actions-single">
                <Button onClick={submit}><Send size={15} /> 以 {actor.name} 提交</Button>
              </div>
              {reviewActive && (
                <div className="accepted-box">
                  <div className="side-label">已接受内容（依据 v{review!.basisVersion}，不可覆盖）</div>
                  {review!.signatures.map((s) => (
                    <div className="sig-row" key={s.reviewerId + s.at}><Check size={13} /><div><strong>{s.reviewerName} · {s.conclusion}</strong><small>{s.at} · {s.note}</small></div></div>
                  ))}
                  <small className="muted">提示：切换到另一名复核员（如周叙）再次提交；理由一致则会签，理由或区域不同则进入下方待裁决账。</small>
                </div>
              )}
            </Card>
          </div>
          <ArbitrationLedger docId={doc.id} />
        </>
      )}
    </div>
  );
}

/* ============================== 发布批次：快照、检查点、隔离 ============================== */

function QuarantineDialog({ batch, docId, onClose }: { batch: ReleaseBatch; docId: string | null; onClose: () => void }) {
  const documents = useDisclosureStore((s) => s.documents);
  const quarantineResnapshot = useDisclosureStore((s) => s.quarantineResnapshot);
  const doc = documents.find((d) => d.id === docId);
  const [snapshot, setSnapshot] = useState<Classification>('严格机密');
  const [note, setNote] = useState('');
  if (!doc || !docId) return null;
  return (
    <Dialog.Root open={!!docId} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>隔离复核 · 补录密级快照</Dialog.Title>
          <Dialog.Description>{doc.id} 来自历史批次 {batch.id}，加入时缺少密级快照，已被隔离。不得按今天的密级直接放行，须复核后人工补录。</Dialog.Description>
          <label className="dlg-label">复核确认的密级快照
            <select value={snapshot} onChange={(e) => setSnapshot(e.target.value as Classification)}>
              <option>内部</option><option>机密</option><option>严格机密</option>
            </select>
          </label>
          <label className="dlg-label">隔离复核说明（必填）
            <textarea className="review-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="对照原始归档页重新核定密级的依据……" />
          </label>
          <div className="dialog-btn-row">
            <Dialog.Close asChild><Button variant="outline">取消</Button></Dialog.Close>
            <Button onClick={() => { const r = quarantineResnapshot(batch.id, docId, snapshot, note); if (r.ok) { setNote(''); onClose(); } }}><ShieldCheck size={15} /> 完成隔离复核</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BatchesPage() {
  const documents = useDisclosureStore((s) => s.documents);
  const reviews = useDisclosureStore((s) => s.reviews);
  const batches = useDisclosureStore((s) => s.batches);
  const currentUserId = useDisclosureStore((s) => s.currentUserId);
  const failInjectionDocId = useDisclosureStore((s) => s.failInjectionDocId);
  const store = useDisclosureStore();
  const actor = USERS.find((u) => u.id === currentUserId)!;
  const [batchId, setBatchId] = useState(batches[0]?.id ?? 'BATCH-01');
  const [quarantineDoc, setQuarantineDoc] = useState<string | null>(null);
  const batch = batches.find((b) => b.id === batchId) ?? batches[0];
  const bStatus = batchStatus(batch);
  const remaining = batch.items.filter((i) => i.state === '待导出');
  const progress = Math.round((batch.export.completedDocIds.length / Math.max(1, batch.items.length)) * 100);

  const exportLine = useMemo(() => {
    if (batch.export.phase === '失败') return { tone: 'red' as const, icon: <FileWarning size={15} />, text: batch.export.error ?? '导出失败' };
    if (batch.export.phase === '导出中') return { tone: 'blue' as const, icon: <Hourglass size={15} />, text: `正在导出 ${batch.export.currentDocId ?? ''}…（检查点 ${batch.export.completedDocIds.length}/${batch.items.length}）` };
    if (batch.export.phase === '已完成') return { tone: 'green' as const, icon: <Check size={15} />, text: `批次全部导出完成（${batch.items.length}/${batch.items.length}）` };
    return { tone: 'neutral' as const, icon: <ClipboardCheck size={15} />, text: `待导出 ${remaining.length} 份，检查点已完成 ${batch.export.completedDocIds.length} 份` };
  }, [batch, remaining.length]);

  return (
    <div className="page">
      <header className="page-heading">
        <div><small>RELEASE BATCH / SNAPSHOT GATE</small><h1>发布批次与导出检查点</h1><p>批次只认加入时的密级快照与依据版本；导出失败从检查点重试，同一文档不会重复导出。</p></div>
      </header>
      <div className="batch-layout">
        <Card className="batch-list">
          <div className="card-title"><Layers3 size={17} /><strong>发布批次</strong></div>
          {batches.map((b) => {
            const st = batchStatus(b);
            return (
              <button key={b.id} className={b.id === batch.id ? 'active' : ''} onClick={() => setBatchId(b.id)}>
                <span>{b.id}</span>
                <strong>{b.name}</strong>
                <small>{b.items.length} 份 · {b.createdAt}</small>
                <Badge tone={statusTone(st)}>{st}</Badge>
              </button>
            );
          })}
        </Card>
        <Card className="batch-content">
          <div className="card-title"><Tags size={17} /><strong>{batch.name}</strong><span>{batch.items.length} 份 · {batch.id}</span></div>
          <div className="batch-table">
            {batch.items.map((item) => {
              const doc = documents.find((d) => d.id === item.docId);
              const stale = item.classificationSnapshot !== null && item.basisVersion !== doc?.basis.version;
              const quarantined = item.classificationSnapshot === null;
              return (
                <div key={item.docId} className="batch-row batch-row-rich">
                  <FileText size={17} />
                  <div className="batch-doc-main">
                    <strong>{doc?.title ?? item.docId}</strong>
                    <span>{item.docId} · 加入于 {item.addedAt}</span>
                  </div>
                  <div className="batch-badges">
                    {quarantined ? (
                      <Badge tone="red">无密级快照 · 隔离待复核</Badge>
                    ) : (
                      <>
                        <Badge tone={classTone(item.classificationSnapshot!)}>快照 {item.classificationSnapshot}</Badge>
                        {stale && <Badge tone="red">依据过期 v{item.basisVersion}→v{doc?.basis.version}</Badge>}
                      </>
                    )}
                    <Badge tone={statusTone(item.state === '已完成' ? '已完成' : item.state)}>{item.state}</Badge>
                  </div>
                  <div className="batch-row-actions">
                    {quarantined ? (
                      <Button variant="outline" onClick={() => setQuarantineDoc(item.docId)}><ShieldCheck size={13} /> 复核补录</Button>
                    ) : item.state === '已完成' ? (
                      <Check size={15} className="done-icon" />
                    ) : (
                      <button className="mini-remove" onClick={() => store.removeFromBatch(batch.id, item.docId)} title="移出批次"><X size={13} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="add-docs">
            <div className="side-label">加入文档（同一批次自动去重，无权文档无法夹带）</div>
            <div className="add-doc-list">
              {documents.filter((d) => !batch.items.some((i) => i.docId === d.id)).map((doc) => {
                const canView = canViewDoc(actor, doc);
                return (
                  <button key={doc.id} className="add-doc-chip" onClick={() => store.addToBatch(batch.id, doc.id)}>
                    {canView ? <FileText size={13} /> : <Lock size={13} />}
                    {canView ? doc.title : `${doc.id}（${doc.basis.classification} 无权）`}
                    <Badge tone={classTone(doc.basis.classification)}>{doc.basis.classification}</Badge>
                  </button>
                );
              })}
              {documents.every((d) => batch.items.some((i) => i.docId === d.id)) && <small className="muted">所有文档均已在批次中，重复加入会被拒绝。</small>}
            </div>
          </div>

          <div className="export-console">
            <div className={`export-line ${exportLine.tone}`}>{exportLine.icon}<span>{exportLine.text}</span></div>
            <div className="progress export-progress"><i style={{ width: `${batch.export.phase === '未开始' ? 0 : progress}%` }} /></div>
            <div className="export-controls">
              {batch.export.phase === '失败' ? (
                <Button onClick={() => store.retryExport(batch.id)}><RefreshCw size={15} /> 从检查点重试（跳过已完成 {batch.export.completedDocIds.length} 份）</Button>
              ) : (
                <Button disabled={batch.export.phase === '导出中' || batch.export.phase === '已完成' || batch.items.length === 0} onClick={() => store.startExport(batch.id)}><Play size={15} /> {batch.export.completedDocIds.length > 0 ? '继续导出' : '开始导出'}</Button>
              )}
              <label className="fault-toggle">
                故障注入（下一次导出到
                <select value={failInjectionDocId ?? ''} onChange={(e) => store.setFailInjection(e.target.value || null)}>
                  <option value="">不注入</option>
                  {documents.map((d) => <option key={d.id} value={d.id}>{d.id}</option>)}
                </select>
                时中断）
              </label>
              <small className="muted">当前操作人 {actor.name} · {actor.role} · {actor.clearance}（发布员才可导出；顾言为内部密级，高衡为严格机密）</small>
            </div>
          </div>
        </Card>
        <Card className="batch-summary">
          <div className="side-label">当前批次门禁</div>
          <strong>{batch.id}</strong>
          <dl>
            <div><dt>文档总数</dt><dd>{batch.items.length}</dd></div>
            <div><dt>已完成检查点</dt><dd>{batch.export.completedDocIds.length}</dd></div>
            <div><dt>退回等待</dt><dd className={batch.items.some((i) => i.state === '退回等待') ? 'danger-text' : ''}>{batch.items.filter((i) => i.state === '退回等待').length}</dd></div>
            <div><dt>隔离待复核</dt><dd className={batch.items.some((i) => i.classificationSnapshot === null) ? 'danger-text' : ''}>{batch.items.filter((i) => i.classificationSnapshot === null).length}</dd></div>
          </dl>
          <div className="summary-note"><AlertTriangle size={15} /><span>密级或区域变化后，相关文档条目退回等待，重新复核通过才恢复；其他文档照旧导出。</span></div>
          <div className="summary-note info-note"><PanelLeftClose size={15} /><span>重试仅处理检查点之后的文档；已完成文档按 docId 去重，绝不重复进入导出产物。</span></div>
          <div className="summary-note info-note"><ScanSearch size={15} /><span>文档实时状态：{documents.map((d) => `${d.id.replace('DOC-004', '')}:${docStatus(d, reviews[d.id])}`).join(' / ')}</span></div>
        </Card>
      </div>
      <QuarantineDialog batch={batch} docId={quarantineDoc} onClose={() => setQuarantineDoc(null)} />
    </div>
  );
}

const rootRoute = createRootRoute({ component: AppShell });
const documentsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DocumentsPage });
const reviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/review/$documentId', component: ReviewPage });
const qualityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/quality', component: QualityPage });
const batchesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/batches', component: BatchesPage });
const routeTree = rootRoute.addChildren([documentsRoute, reviewRoute, qualityRoute, batchesRoute]);
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

export default function App() {
  return <RouterProvider router={router} />
}
