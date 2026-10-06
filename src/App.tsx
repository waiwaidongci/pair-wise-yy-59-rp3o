import { useEffect, useRef, useState } from 'react';
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
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Eye,
  FileCheck2,
  FileText,
  Highlighter,
  Layers3,
  Lock,
  Menu,
  PanelLeftClose,
  ScanSearch,
  ShieldCheck,
  Stamp,
  Tags,
  UploadCloud,
  UserCheck,
  X
} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Badge, Button, Card, Dialog, Tabs, X as XIcon } from './components/ui';
import { useDisclosureStore, type DisclosureRecord } from './store';
import { can, actorName, ALL_ROLES, type Role } from './auth';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const bundleQuery = async () => ({
  queue: [
    { id: 'Q-31', name: '第三批补充材料', count: 128, owner: '林清', progress: 68, due: '今日 16:00' },
    { id: 'Q-32', name: '证人材料图像件', count: 47, owner: '周叙', progress: 34, due: '明日 11:00' },
    { id: 'Q-33', name: '专家报告附件', count: 19, owner: '顾言', progress: 91, due: '09-30 18:00' }
  ]
});

function DenialToast() {
  const lastDenial = useDisclosureStore((state) => state.lastDenial);
  const clearDenial = useDisclosureStore((state) => state.clearDenial);
  useEffect(() => {
    if (!lastDenial) return;
    const timer = setTimeout(clearDenial, 4500);
    return () => clearTimeout(timer);
  }, [lastDenial, clearDenial]);
  if (!lastDenial) return null;
  return (
    <div className="denial-toast" role="alert">
      <AlertTriangle size={16} />
      <div><strong>操作被拒绝</strong><span>{lastDenial.reason}</span></div>
      <button onClick={clearDenial} aria-label="关闭"><X size={15} /></button>
    </div>
  );
}

function RoleSwitcher() {
  const currentRole = useDisclosureStore((state) => state.currentRole);
  const setRole = useDisclosureStore((state) => state.setRole);
  return (
    <div className="role-switcher">
      <UserCheck size={14} />
      <select value={currentRole} onChange={(event) => setRole(event.target.value as Role)}>
        {ALL_ROLES.map((role) => <option key={role} value={role}>{role} · {actorName(role)}</option>)}
      </select>
    </div>
  );
}

function BasisBadge({ documentId }: { documentId: string }) {
  const bases = useDisclosureStore((state) => state.bases);
  const basis = bases.find((b) => b.documentId === documentId && b.status === '有效');
  if (!basis) return <Badge tone="red">依据已失效</Badge>;
  return <Badge tone="blue">依据 v{basis.version}</Badge>;
}

function ReviewStatusBadge({ documentId }: { documentId: string }) {
  const reviews = useDisclosureStore((state) => state.reviews);
  const bases = useDisclosureStore((state) => state.bases);
  const basis = bases.find((b) => b.documentId === documentId && b.status === '有效');
  const review = reviews.find((r) => r.documentId === documentId && r.basisId === basis?.id && r.status === '已接受');
  if (review) return <Badge tone="green">已复核 · {review.reviewer}</Badge>;
  return <Badge tone="amber">待复核</Badge>
}

function CurrentOperator() {
  const currentRole = useDisclosureStore((state) => state.currentRole);
  return <div className="operator"><span>当前操作者</span><strong>{actorName(currentRole)}</strong></div>;
}

function AppShell() {
  const [mobileNav, setMobileNav] = useState(false);
  const links = [
    { to: '/', label: '文档集', icon: Layers3 },
    { to: '/review/$documentId', label: '去密审阅', icon: Highlighter },
    { to: '/quality', label: '发布质检', icon: ScanSearch },
    { to: '/batches', label: '批次与标签', icon: Tags }
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-symbol"><Stamp size={18} /></div>
          <div><strong>披露质控台</strong><span>North Ridge / Litigation Support</span></div>
        </div>
        <div className="top-actions">
          <RoleSwitcher />
          <Badge tone="amber">2 项待质检</Badge>
          <CurrentOperator />
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
            <div><ShieldCheck size={16} /><span>审计记录已开启</span></div>
            <small>草稿自动保存在本机</small>
          </div>
        </aside>
        <main className="main-content"><Outlet /></main>
        <DenialToast />
      </div>
    </div>
  );
}

function DocumentsPage() {
  const documents = useDisclosureStore((state) => state.documents);
  const auditLog = useDisclosureStore((state) => state.auditLog);
  const currentRole = useDisclosureStore((state) => state.currentRole);
  const { data } = useQuery({ queryKey: ['document-queues'], queryFn: bundleQuery });
  const [filter, setFilter] = useState('全部');
  const visible = filter === '全部' ? documents : documents.filter((doc) => doc.status === filter);
  return (
    <div className="page">
      <header className="page-heading">
        <div><small>DISCLOSURE CONTROL / DOCUMENT SET</small><h1>披露文档集</h1><p>密级、去密区域、复核结论与发布批次共用一条授权依据，变化即失效。</p></div>
        <Button><UploadCloud size={16} /> 导入文档集</Button>
      </header>
      <section className="summary-strip">
        <div><span>文档总数</span><strong>194</strong><small>12.8 GB</small></div>
        <div><span>去密区域</span><strong>2,481</strong><small>较上版 +34</small></div>
        <div><span>待质检</span><strong className="warning-text">17</strong><small>4 项高风险</small></div>
        <div><span>已批准批次</span><strong>6</strong><small>本周 +2</small></div>
      </section>
      <div className="two-column">
        <Card className="document-table-card">
          <div className="card-heading">
            <div><Tabs.Root value={filter} onValueChange={setFilter}><Tabs.List className="segmented">
              {['全部', '去密中', '待质检', '可发布'].map((item) => <Tabs.Trigger key={item} value={item}>{item}</Tabs.Trigger>)}
            </Tabs.List></Tabs.Root></div>
            <span>{visible.length} 份文档</span>
          </div>
          <div className="document-table">
            {visible.map((doc) => {
              const canView = can(currentRole, '查看', doc.classification);
              const canModify = can(currentRole, '修改', doc.classification);
              const canExport = can(currentRole, '导出', doc.classification);
              return (
                <div className="document-row" key={doc.id}>
                  <div className="file-icon"><FileText size={19} /></div>
                  <div className="doc-main">
                    <strong>{doc.title}</strong>
                    <span>{doc.id} · {doc.bundle} · {doc.size}</span>
                    <div className="doc-badges"><BasisBadge documentId={doc.id} /><ReviewStatusBadge documentId={doc.id} /></div>
                  </div>
                  <div className="doc-field"><span>密级</span><Badge tone={doc.classification === '严格机密' ? 'red' : doc.classification === '机密' ? 'amber' : 'neutral'}>{doc.classification}</Badge></div>
                  <div className="doc-field"><span>负责人员</span><strong>{doc.owner}</strong></div>
                  <div className="doc-field"><span>状态</span><Badge tone={doc.status === '可发布' ? 'green' : doc.status === '待质检' ? 'amber' : 'blue'}>{doc.status}</Badge></div>
                  <div className="doc-perms">
                    <span className={canView ? 'perm allowed' : 'perm denied'} title={canView ? '可查看' : '无权查看'}>{canView ? <Eye size={13} /> : <Lock size={13} />}</span>
                    <span className={canModify ? 'perm allowed' : 'perm denied'} title={canModify ? '可修改' : '无权修改'}>{canModify ? <Highlighter size={13} /> : <Lock size={13} />}</span>
                    <span className={canExport ? 'perm allowed' : 'perm denied'} title={canExport ? '可导出' : '无权导出'}>{canExport ? <UploadCloud size={13} /> : <Lock size={13} />}</span>
                  </div>
                  <div className="doc-actions">
                    <Link to="/review/$documentId" params={{ documentId: doc.id }}><Button variant="outline">审阅</Button></Link>
                  </div>
                </div>
              );
            })}
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
            <div className="card-title"><ShieldCheck size={17} /><strong>审计记录</strong><span>{auditLog.length} 条</span></div>
            {auditLog.slice(0, 8).map((entry) => (
              <p key={entry.id} className={entry.result === '拒绝' ? 'audit-denied' : ''}>
                <b>{entry.timestamp.slice(11, 16)}</b>
                <span className={`audit-result ${entry.result === '拒绝' ? 'denied' : 'allowed'}`}>{entry.result}</span>
                {entry.actor} · {entry.action} · {entry.resource}
                {entry.reason && <small>{entry.reason}</small>}
              </p>
            ))}
          </Card>
        </aside>
      </div>
    </div>
  );
}

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

function ReviewPage() {
  const { documentId } = useParams({ from: '/review/$documentId' });
  const navigate = useNavigate();
  const { documents, activePage, redactionMode, activeRedactionId, bases, reviews, adjudication, currentRole } = useDisclosureStore();
  const store = useDisclosureStore();
  const doc = documents.find((item) => item.id === documentId) ?? documents[0];
  const pageRegions = doc.redactions.filter((item) => item.page === activePage);
  const active = doc.redactions.find((item) => item.id === activeRedactionId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('商业秘密');
  const [privilege, setPrivilege] = useState('合同保密');

  const basis = bases.find((b) => b.documentId === doc.id && b.status === '有效');
  const basisInvalid = !basis;
  const docReviews = reviews.filter((r) => r.documentId === doc.id);
  const acceptedReview = docReviews.find((r) => r.status === '已接受');
  const pendingAdjudication = adjudication.filter((a) => a.documentId === doc.id && a.status === '待裁决');
  const canModify = can(currentRole, '修改', doc.classification);
  const canView = can(currentRole, '查看', doc.classification);

  if (!canView) {
    return (
      <div className="page review-page">
        <div className="permission-denied-panel">
          <Lock size={32} />
          <h2>无权查看该文档</h2>
          <p>当前角色「{currentRole}」无权查看 {doc.classification} 密级文档 {doc.title}。</p>
          <p className="muted">权限不足的操作已记录到审计日志。</p>
          <Button variant="outline" onClick={() => navigate({ to: '/' })}><ArrowLeft size={15} /> 返回文档集</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page review-page">
      <header className="review-header">
        <div className="review-title">
          <Button variant="ghost" onClick={() => navigate({ to: '/' })}><ArrowLeft size={16} /></Button>
          <div><small>{doc.id} / 去密审阅</small><h1>{doc.title}</h1></div>
          <Badge tone={doc.classification === '严格机密' ? 'red' : 'amber'}>{doc.classification}</Badge>
          {basisInvalid ? <Badge tone="red">依据已失效</Badge> : <Badge tone="blue">依据 v{basis?.version}</Badge>}
          {acceptedReview ? <Badge tone="green">已复核 · {acceptedReview.reviewer}</Badge> : <Badge tone="amber">待复核</Badge>}
        </div>
        <div className="review-actions">
          <Button variant="outline" onClick={() => store.toggleRedactionMode()} className={redactionMode ? 'active-button' : ''} disabled={!canModify}><Highlighter size={16} /> {redactionMode ? '取消绘制' : '绘制去密区'}</Button>
          <Button variant="outline" onClick={() => setDialogOpen(true)}><FileCheck2 size={16} /> 发布前校验</Button>
          <Button onClick={() => store.submitReview(doc.id, '通过', doc.redactions, '复核通过')} disabled={!canView}><Check size={16} /> 提交复核</Button>
        </div>
      </header>
      {basisInvalid && (
        <div className="basis-invalid-banner">
          <AlertTriangle size={16} />
          <span>授权依据已失效：密级或去密区域发生变化，相关复核已失效，待导出批次已退回等待。请重新提交复核。</span>
        </div>
      )}
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
              onDraw={redactionMode && canModify ? (region) => store.addRedaction({ ...region, page: activePage, reason, privilege }) : undefined}
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
          <div className="side-label">区域属性</div>
          {active ? (
            <>
              <div className="inspector-title"><strong>{active.reason}</strong><Badge tone={active.status === 'confirmed' ? 'green' : 'amber'}>{active.status === 'confirmed' ? '已确认' : '草稿'}</Badge></div>
              <label>保密级别<select value={doc.classification} disabled={!canModify} onChange={(event) => store.updateClassification(event.target.value as DisclosureRecord['classification'])}><option>内部</option><option>机密</option><option>严格机密</option></select></label>
              <label>去密原因<input value={active.reason} readOnly /></label>
              <label>特权标签<input value={active.privilege} readOnly /></label>
              <label>责任人员<input value={doc.owner} readOnly /></label>
              <div className="coordinate-grid"><div><span>X</span><b>{Math.round(active.x * 100)}%</b></div><div><span>Y</span><b>{Math.round(active.y * 100)}%</b></div><div><span>宽</span><b>{Math.round(active.width * 100)}%</b></div><div><span>高</span><b>{Math.round(active.height * 100)}%</b></div></div>
              <Button onClick={() => store.confirmRedaction(active.id)} disabled={active.status === 'confirmed' || !canModify}><Check size={15} /> 确认此区域</Button>
              <Button variant="outline" disabled={!canModify}><Copy size={15} /> 批量复制到同类页</Button>
            </>
          ) : <p className="muted">在文档页面上选择一个去密区域查看属性。</p>}
          <div className="rule-note"><AlertTriangle size={16} /><span>发布版本不得包含原始文本层或图片残片。密级或区域变化将导致授权依据失效。</span></div>
        </aside>
      </div>
      {pendingAdjudication.length > 0 && (
        <div className="adjudication-panel">
          <div className="card-title"><UserCheck size={17} /><strong>待裁决账</strong><span>{pendingAdjudication.length} 项</span></div>
          {pendingAdjudication.map((entry) => (
            <div className="adjudication-item" key={entry.id}>
              <div><strong>{entry.reviewer}</strong> 提交 · {entry.submittedAt.slice(11, 16)}</div>
              <span>区域 {entry.redactions.length} 个 · {entry.reason || '无理由'}</span>
              <small>依据已被先提交者占用，内容待裁决，不覆盖已接受复核。</small>
            </div>
          ))}
        </div>
      )}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>发布前校验</Dialog.Title>
            <Dialog.Description>系统将核对原始页与发布页的一致性，并检查元数据残留。</Dialog.Description>
            <div className="dialog-checks">
              <p><Check /> {doc.redactions.length} 个去密区域已定位</p>
              <p><Check /> 文档版本与操作者记录完整</p>
              <p className={doc.redactions.some((item) => item.status === 'draft') ? 'failed' : ''}><AlertTriangle /> {doc.redactions.some((item) => item.status === 'draft') ? '仍有未确认区域' : '所有区域已确认'}</p>
            </div>
            <Dialog.Close asChild><Button>返回检查 <X size={15} /></Button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function QualityPage() {
  const { documents, reviews, bases, currentRole } = useDisclosureStore();
  const store = useDisclosureStore();
  const doc = documents[1];
  const basis = bases.find((b) => b.documentId === doc.id && b.status === '有效');
  const docReviews = reviews.filter((r) => r.documentId === doc.id);
  const acceptedReview = docReviews.find((r) => r.status === '已接受');
  const canExport = can(currentRole, '导出', doc.classification);
  const checks = [
    { id: 'forbidden-terms', label: '全文禁词与姓名复核', detail: '扫描原始页和发布页文本层' },
    { id: 'page-number', label: '页序与页码连续性', detail: '检查拆页、合并及漏页情况' },
    { id: 'image-boundary', label: '图像边界残片', detail: '逐页比较遮蔽边界 2mm 区域' },
    { id: 'metadata', label: '文档元数据清理', detail: '作者、修订人、批注和隐藏字段' }
  ];
  return (
    <div className="page">
      <header className="page-heading"><div><small>QUALITY ASSURANCE / SIDE-BY-SIDE</small><h1>发布质控双人复核</h1><p>并排检查原始页与发布页，所有复核结论引用同一条授权依据。</p></div><Button disabled={!canExport}><FileCheck2 size={16} /> 导出发布清单</Button></header>
      <div className="comparison-banner">
        <div><Eye size={17} /><strong>{doc.title}</strong><span>版本 {basis?.version ?? 1} · 双人复核</span></div>
        {acceptedReview ? <Badge tone="green">已复核 · {acceptedReview.reviewer}</Badge> : <Badge tone="amber">等待复核</Badge>}
      </div>
      <div className="compare-grid">
        <Card className="compare-panel"><div className="compare-head"><span>原始页</span><Badge tone="neutral">源文件</Badge></div><div className="compare-page"><PdfPage pageNumber={1} /></div></Card>
        <Card className="compare-panel"><div className="compare-head"><span>发布页</span><Badge tone="green">已遮蔽</Badge></div><div className="compare-page redacted-preview"><PdfPage pageNumber={1} redacted /><div className="demo-mask mask-one" /><div className="demo-mask mask-two" /></div></Card>
      </div>
      <div className="quality-bottom">
        <Card className="checks-card"><div className="card-title"><ClipboardCheck size={17} /><strong>发布前校验项</strong></div>{checks.map((check) => <button className="check-row" key={check.id} onClick={() => store.toggleReviewCheck(check.id)}><span className={store.reviewChecks[check.id] ? 'checked' : ''}>{store.reviewChecks[check.id] && <Check size={13} />}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></button>)}</Card>
        <Card className="decision-card">
          <div className="card-title"><ShieldCheck size={17} /><strong>复核结论</strong></div>
          <p>本批次共有 <b>{doc.redactions.length}</b> 个去密区域，其中已确认 {doc.redactions.filter((item) => item.status === 'confirmed').length} 个。</p>
          <p>授权依据：{basis ? <Badge tone="blue">v{basis.version}</Badge> : <Badge tone="red">已失效</Badge>}</p>
          {acceptedReview ? <p>复核结论：<Badge tone="green">{acceptedReview.result} · {acceptedReview.reviewer}</Badge></p> : <p className="muted">尚无已接受的复核结论。</p>}
          <label><input type="checkbox" checked={store.metadataCleaned} onChange={store.toggleMetadata} /> 已确认元数据清理</label>
          <div className="decision-actions"><Button variant="outline"><ArrowLeft size={15} /> 退回补件</Button><Button disabled={!store.metadataCleaned || Object.values(store.reviewChecks).some((value) => !value)} onClick={store.markReady}><Check size={15} /> 通过并标记可发布</Button></div>
        </Card>
      </div>
    </div>
  );
}

function BatchesPage() {
  const { documents, batches, currentRole } = useDisclosureStore();
  const store = useDisclosureStore();
  const [selected, setSelected] = useState<string[]>(['DOC-00418']);
  const [activeBatchId, setActiveBatchId] = useState(batches[0]?.id ?? '');
  const activeDoc = documents.find((doc) => doc.id === selected[0]) ?? documents[0];
  const activeBatch = batches.find((b) => b.id === activeBatchId) ?? batches[0];
  const canExport = can(currentRole, '导出', activeDoc.classification);

  return (
    <div className="page">
      <header className="page-heading"><div><small>RELEASE BATCH / TAXONOMY</small><h1>发布批次与标签</h1><p>按案件问题、辖区和披露对象组织文档，生成可追溯发布清单。旧批次缺密级快照先隔离待复核。</p></div><Button onClick={() => store.exportBatch(activeBatch.id)} disabled={!canExport || activeBatch.status === '已导出'}><UploadCloud size={16} /> 生成发布包</Button></header>
      <div className="batch-layout">
        <Card className="batch-list">
          <div className="card-title"><Layers3 size={17} /><strong>发布批次</strong></div>
          {batches.map((batch) => (
            <button key={batch.id} className={activeBatch.id === batch.id ? 'active' : ''} onClick={() => setActiveBatchId(batch.id)}>
              <span>{batch.id}</span>
              <strong>{batch.name}</strong>
              <small>
                {batch.documentIds.length} 份 ·
                {batch.status === '已导出' ? ' 已导出' : batch.status === '已隔离' ? ' 已隔离' : ' 等待'}
                {batch.hasSnapshot ? ' · 有快照' : ' · 无快照'}
              </small>
            </button>
          ))}
        </Card>
        <Card className="batch-content">
          <div className="card-title">
            <Tags size={17} /><strong>文档与案件问题映射</strong>
            <span>{selected.length} 已选择</span>
          </div>
          <div className="batch-table">
            {documents.map((doc) => {
              const docCanExport = can(currentRole, '导出', doc.classification);
              return (
                <label key={doc.id} className="batch-row">
                  <input type="checkbox" checked={selected.includes(doc.id)} onChange={() => setSelected((ids) => ids.includes(doc.id) ? ids.filter((id) => id !== doc.id) : [...ids, doc.id])} />
                  <FileText size={17} />
                  <div><strong>{doc.title}</strong><span>{doc.id} · {doc.issue}</span></div>
                  <Badge tone={doc.status === '可发布' ? 'green' : 'amber'}>{doc.status}</Badge>
                  <span className={docCanExport ? 'perm allowed' : 'perm denied'} title={docCanExport ? '可导出' : '无权导出'}>{docCanExport ? <UploadCloud size={13} /> : <Lock size={13} />}</span>
                </label>
              );
            })}
          </div>
          <div className="tag-editor">
            <h3>标签与分发级</h3>
            <div className="tag-options">{(['合同问题', '设备缺陷', '现场安全', '损害赔偿', '仅律师可见']).map((tag, index) => <span key={tag} className={index < 3 ? 'selected' : ''}>{tag}</span>)}</div>
            <label>导出清单说明<textarea defaultValue="按案卷编号升序导出，保留去密版本、操作者与审批时间。" /></label>
            <Button>保存批次设置</Button>
          </div>
        </Card>
        <Card className="batch-summary">
          <div className="side-label">当前批次摘要</div>
          <strong>{activeBatch.name}</strong>
          <dl>
            <div><dt>文档</dt><dd>{activeBatch.documentIds.length}</dd></div>
            <div><dt>页数</dt><dd>{activeBatch.documentIds.reduce((sum, id) => sum + (documents.find((doc) => doc.id === id)?.pages ?? 0), 0)}</dd></div>
            <div><dt>密级快照</dt><dd>{activeBatch.hasSnapshot ? <Badge tone="green">已有</Badge> : <Badge tone="red">缺失</Badge>}</dd></div>
            <div><dt>导出检查点</dt><dd>{activeBatch.exportCheckpoint} / {activeBatch.documentIds.length}</dd></div>
            <div><dt>状态</dt><dd><Badge tone={activeBatch.status === '已导出' ? 'green' : activeBatch.status === '已隔离' ? 'red' : 'amber'}>{activeBatch.status}</Badge></dd></div>
          </dl>
          {activeBatch.status === '已隔离' && (
            <div className="isolation-note">
              <AlertTriangle size={15} />
              <span>该批次缺少密级快照，已隔离待复核。不能按今天的密级放行。</span>
              <Button variant="outline" onClick={() => store.createBatchSnapshot(activeBatch.id)}><Check size={13} /> 创建快照并解除隔离</Button>
            </div>
          )}
          {activeBatch.status === '等待' && activeBatch.hasSnapshot && (
            <div className="summary-note">
              <AlertTriangle size={15} />
              <span>导出失败后从检查点重试，同一文档不会在批次里重复。</span>
            </div>
          )}
          {activeBatch.status === '已导出' && (
            <div className="summary-note exported">
              <Check size={15} />
              <span>已于 {activeBatch.exportedAt?.slice(11, 16)} 导出完成。</span>
            </div>
          )}
          {activeBatch.exportCheckpoint > 0 && activeBatch.status !== '已导出' && activeBatch.status !== '已隔离' && (
            <Button variant="outline" onClick={() => store.retryExport(activeBatch.id)} className="retry-button">
              <UploadCloud size={15} /> 从检查点 {activeBatch.exportCheckpoint} 重试导出
            </Button>
          )}
        </Card>
      </div>
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
  return <RouterProvider router={router} />;
}
