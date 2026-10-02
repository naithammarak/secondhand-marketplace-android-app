import { useCallback, useRef, useState, type PropsWithChildren } from 'react';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { inspectionError, useInspectionApi, useInspectionMutation } from '@/inspections/use-inspection-api';
import { orderStatusLabel } from '@/orders/order-format';
import { parseRouteId } from '@/orders/route-params';
import { createOrderService, type OrderDetail } from '@/services/order-service';
import type { BuyerResult, BuyerDecision, CourierShipmentScope, EvidenceFile, WorkDetail, CourierShipment } from '@/services/inspection-service';
import { MarketplaceHeader } from '../marketplace-header';
import { Button, Card, Loading, Row, Screen, styles } from '../order-ui';
import { ThemedText } from '../themed-text';
import { EmptyState } from '../wondee/primitives';
import { BuyerResultView, InspectorQueueView, InspectorWorkView, SellerShipView } from './views';

type Kind = 'ship' | 'result' | 'queue' | 'work' | 'courier' | 'admin';
const titles: Record<Kind, string> = { ship: 'ส่งสินค้าเข้าศูนย์', result: 'ผลการตรวจสินค้า', queue: 'งานตรวจสินค้า', work: 'ตรวจสินค้า', courier: 'งานส่งเข้าศูนย์', admin: 'มอบหมายผู้ขนส่ง' };

function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(undefined);
    try { const next = await load(); if (generation.current === current) setData(next); }
    catch (failure) { if (generation.current === current) setError(inspectionError(failure)); }
    finally { if (generation.current === current) setLoading(false); }
  }, [load]);
  useFocusEffect(useCallback(() => { void reload(); return () => { generation.current++; }; }, [reload]));
  return { data, error, loading, reload };
}

function Status({ loading, error, reload }: { loading: boolean; error?: string; reload(): Promise<void> }) {
  return <>{loading && <Loading label="กำลังโหลดข้อมูลจากระบบ" />}{error && <Card><ThemedText accessibilityRole="alert">{error}</ThemedText><Button label="ลองโหลดอีกครั้ง" onPress={() => { void reload(); }} /></Card>}</>;
}

export function InspectionScreen({ kind }: { kind: Kind }) {
  const auth = useAuth();
  const params = useLocalSearchParams<{ orderId?: string; inspectionId?: string }>();
  const id = parseRouteId(kind === 'work' ? params.inspectionId : params.orderId);
  if (!auth.initializing && !auth.session) return <Redirect href="/login" />;
  const roles = kind === 'courier' ? ['COURIER'] : kind === 'admin' ? ['ADMIN'] : kind === 'queue' || kind === 'work' ? ['INSPECTOR'] : kind === 'ship' ? ['SELLER'] : ['BUYER', 'SELLER'];
  const checking = auth.initializing || auth.accountChecking;
  const allowed = auth.account?.source === 'backend' && !auth.accountError && roles.includes(auth.account.role ?? '');
  const valid = ['queue', 'courier', 'admin'].includes(kind) || id !== null;
  return <Screen><SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
    <MarketplaceHeader title={titles[kind]} back /><ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {checking ? <Loading label="กำลังตรวจสอบบัญชี" /> : !allowed ? <Card><ThemedText>บัญชีนี้ไม่มีสิทธิ์ใช้บริการนี้ หรือยังตรวจสอบบัญชีไม่สำเร็จ</ThemedText><Button label="ตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} /></Card> : !valid ? <EmptyState title="รหัสรายการไม่ถูกต้อง" /> :
        <Connected key={`${auth.session?.user.id}:${kind}:${id}`} kind={kind} id={id ?? 0} />}
    </ScrollView></SafeAreaView></Screen>;
}

function Connected({ kind, id }: { kind: Kind; id: number }) {
  if (kind === 'ship') return <Ship id={id} />;
  if (kind === 'work') return <Work id={id} />;
  if (kind === 'result') return <Result id={id} />;
  if (kind === 'courier') return <Courier />;
  if (kind === 'admin') return <Admin />;
  return <Queue />;
}

function Ship({ id }: { id: number }) {
  const api = useInspectionApi();
  const orders = useRef(createOrderService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL })).current;
  const resource = useResource(useCallback(() => api.call(token => orders.getOrder(token, id)), [api, orders, id]));
  const action = useInspectionMutation();
  const order = resource.data;
  return <><Status {...resource} />{order && (order.viewerRole === 'seller' && order.status === 'WAITING_SELLER_SHIP' ?
    <SellerShipView orderId={id} productName={order.product.name} busy={action.busy} error={action.error} onSubmit={input => {
      void action.mutate(`ship:${id}:${JSON.stringify(input)}`, key => api.call(token => api.service.ship(token, id, input, key))).then(ok => {
        if (ok) router.replace({ pathname: '/orders/[orderId]', params: { orderId: id } });
      });
    }} /> : <Card><ThemedText>{orderStatusLabel(order.status)}</ThemedText><ThemedText>แจ้งส่งได้เฉพาะผู้ขายของรายการที่ชำระแล้วและรอจัดส่ง</ThemedText></Card>)}</>;
}

function Queue() {
  const api = useInspectionApi();
  const [filter, setFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const status = filter === 'waiting' ? 'SHIPPING_TO_CENTER' : filter === 'inspecting' ? 'INSPECTING' : undefined;
  const resource = useResource(useCallback(() => api.call(token => api.service.list(token, offset, status)), [api, offset, status]));
  return <><InspectorQueueView items={(resource.data?.items ?? []).map(item => ({ id: item.id, orderId: item.order_id, productName: item.product.name, statusLabel: orderStatusLabel(item.order_status) }))}
    total={resource.data?.total ?? null} loading={resource.loading} error={resource.error} filter={filter}
    onFilter={value => { setFilter(value); setOffset(0); }} onRetry={() => { void resource.reload(); }}
    onOpen={inspectionId => router.push({ pathname: '/inspections/[inspectionId]', params: { inspectionId } })}
    onMore={resource.data && offset + resource.data.items.length < resource.data.total && !resource.loading ? () => setOffset(value => value + 20) : undefined} />
    {offset > 0 && <Button label="หน้าก่อนหน้า" disabled={resource.loading} onPress={() => setOffset(value => Math.max(0, value - 20))} />}</>;
}

async function pickEvidence(): Promise<EvidenceFile | null> {
  const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (selected.canceled) return null;
  const asset = selected.assets[0];
  return { uri: asset.uri, name: asset.fileName ?? 'evidence.jpg', type: asset.mimeType ?? 'image/jpeg', size: asset.fileSize, file: asset.file };
}

function Work({ id }: { id: number }) {
  const api = useInspectionApi();
  const resource = useResource(useCallback(() => api.call(token => api.service.detail(token, id)), [api, id]));
  const action = useInspectionMutation();
  const [pendingFile, setPendingFile] = useState<EvidenceFile | null>(null);
  const work = resource.data;
  const perform = async (identity: string, operation: (key: string) => Promise<unknown>) => {
    if (await action.mutate(identity, operation)) await resource.reload();
  };
  const upload = async () => {
    // Keep the selected file on an uncertain response so retry reuses its key.
    const file = pendingFile ?? await pickEvidence();
    if (!file) return;
    setPendingFile(file);
    if (await action.mutate(`evidence:${id}:${file.uri}`, key => api.call(token => api.service.upload(token, id, file, key)), () => setPendingFile(null))) {
      setPendingFile(null); await resource.reload();
    }
  };
  return <><Status {...resource} />{action.error && <ThemedText accessibilityRole="alert">{action.error}</ThemedText>}
    {pendingFile && <Button label="ลองส่งรูปเดิมอีกครั้ง" busy={action.busy} onPress={() => { void upload(); }} />}
    {work?.result ? <ResultData result={work} /> : work && <>
      <Card><Row label="คำสั่งซื้อ" value={`#${work.order_id}`} /><ThemedText>{orderStatusLabel(work.order_status)}</ThemedText>
        {work.shipment && <><Row label="ขนส่ง" value={work.shipment.carrier} /><Row label="เลขติดตาม" value={work.shipment.tracking_number} /><ThemedText>{work.shipment.courier_delivered_at ? 'Courier ยืนยันส่งถึงศูนย์แล้ว' : 'รอ Courier ยืนยันส่งถึงศูนย์'}</ThemedText></>}
      </Card>
      <InspectorWorkView productName={work.product.name} step={work.order_status === 'INSPECTING' ? 2 : 1}
        photos={work.evidence.map(photo => ({ id: photo.id, label: `หลักฐาน ${photo.id}`, source: api.service.privateImageSource(api.token, photo) }))}
        busy={action.busy || resource.loading} onReceive={work.order_status === 'SHIPPING_TO_CENTER' && work.shipment?.courier_delivered_at ? () => { void perform(`receive:${id}`, key => api.call(token => api.service.receive(token, id, null, key))); } : undefined}
        onStart={work.order_status === 'RECEIVED_AT_CENTER' ? () => { void perform(`start:${id}`, key => api.call(token => api.service.start(token, id, key))); } : undefined}
        onPick={work.order_status === 'INSPECTING' && work.evidence.length < 5 && !pendingFile ? () => { void upload(); } : undefined}
        onFinalize={work.order_status === 'INSPECTING' && !pendingFile ? input => { void perform(`result:${id}:${JSON.stringify(input)}`, key => api.call(token => api.service.result(token, id, input, key))); } : undefined} />
    </>}
    <Button label="โหลดสถานะล่าสุด" disabled={action.busy || resource.loading} onPress={() => { void resource.reload(); }} />
  </>;
}

function Result({ id }: { id: number }) {
  const api = useInspectionApi();
  const resource = useResource(useCallback(() => api.call(token => api.service.getBuyerResult(token, id)), [api, id]));
  const action = useInspectionMutation();
  const decide = (decision: BuyerDecision, reason?: string | null) => {
    const identity = `buyer-decision:${id}:${decision}:${reason ?? ''}`;
    void action.mutate(identity, () => api.call(token => api.service.decideBuyerInspection(token, id,
      reason === undefined ? { decision } : { decision, reason }))).then(ok => { if (ok) void resource.reload(); });
  };
  return <><Status {...resource} />{resource.data && <ResultData result={resource.data} busy={action.busy} error={action.error} onDecision={decide} />}</>;
}

function ResultData({ result, busy = false, error, onDecision }: {
  result: BuyerResult | WorkDetail; busy?: boolean; error?: string; onDecision?(decision: BuyerDecision, reason?: string | null): void;
}) {
  const api = useInspectionApi();
  if (!result.result || !result.inspected_at) return <EmptyState title="ยังไม่มีผลการตรวจ" />;
  const buyerCanDecide = 'can_decide' in result;
  return <BuyerResultView outcome={result.result} summary={result.summary ?? ''} inspectedAt={result.inspected_at}
    photos={result.evidence.map(photo => ({ id: photo.id, label: `หลักฐาน ${photo.id}`, source: api.service.privateImageSource(api.token, photo) }))}
    certificate={result.certificate ? { number: result.certificate.certificate_no, publicUrl: result.certificate.public_url, issuedAt: result.certificate.issued_at, status: result.certificate.status } : null}
    recordedDecision={buyerCanDecide && result.decision ? {
      decision: result.decision.decision, reason: result.decision.reason, decidedAt: result.decision.decided_at,
    } : null}
    nextAction={result.next_action} certificatePublicHtml certificateDecision={buyerCanDecide} canDecide={buyerCanDecide && result.can_decide}
    busy={busy} error={error} onDecision={onDecision} />;
}

export function InspectionOrderPanel({ order }: { order: OrderDetail }) {
  const auth = useAuth();
  if (order.paymentStatus !== 'PAID') return null;
  return <ProgressPanel key={`${auth.session?.user.id}:${order.id}`} order={order} />;
}

function ProgressPanel({ order }: { order: OrderDetail }) {
  const api = useInspectionApi();
  const resource = useResource(useCallback(() => api.call(token => api.service.getProgress(token, order.id)), [api, order.id]));
  const progress = resource.data;
  return <Card><ThemedText type="subtitle">การจัดส่งและตรวจสินค้า</ThemedText><Status {...resource} />
    {progress && <><ThemedText>{orderStatusLabel(progress.order_status)}</ThemedText>
      {progress.shipment && <><Row label="ขนส่ง" value={progress.shipment.carrier} /><Row label="เลขติดตาม" value={progress.shipment.tracking_number} /><ThemedText>{progress.shipment.received_at ? 'ศูนย์รับสินค้าแล้ว' : progress.shipment.courier_delivered_at ? 'ส่งถึงศูนย์แล้ว รอรับเข้าตรวจ' : 'อยู่ระหว่างจัดส่งเข้าศูนย์'}</ThemedText></>}
      {order.viewerRole === 'seller' && progress.order_status === 'WAITING_SELLER_SHIP' && <Button label="แจ้งส่งสินค้าเข้าศูนย์" variant="primary" onPress={() => router.push({ pathname: '/orders/[orderId]/ship-to-center', params: { orderId: order.id } })} />}
      {order.viewerRole === 'buyer' && progress.order_status === 'RESULT_NOTIFIED' && <Button label="อ่านผลการตรวจสินค้า" variant="primary" onPress={() => router.push({ pathname: '/orders/[orderId]/inspection', params: { orderId: order.id } })} />}
    </>}
  </Card>;
}

function Courier() {
  const api = useInspectionApi();
  const [scope, setScope] = useState<CourierShipmentScope>('pending');
  const resource = useResource(useCallback(() => api.call(token => api.service.courierShipments(token, scope)), [api, scope]));
  const scopes: { value: CourierShipmentScope; label: string }[] = [
    { value: 'pending', label: 'รอดำเนินการ' }, { value: 'history', label: 'ประวัติ' }, { value: 'all', label: 'ทั้งหมด' },
  ];
  const emptyTitle = scope === 'history' ? 'ยังไม่มีงานส่งถึงศูนย์ในประวัติ' : 'ยังไม่มีงานที่มอบหมายให้คุณ';
  const shipments = resource.data?.scope === scope ? resource.data.items : [];
  return <><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{scopes.map(option =>
    <Button key={option.value} label={option.label} variant={scope === option.value ? 'primary' : 'secondary'} disabled={resource.loading} onPress={() => setScope(option.value)} />
  )}</View><Status {...resource} />{resource.data?.scope === scope && shipments.length === 0 && <EmptyState title={emptyTitle} />}
    {shipments.map(item => <CourierItem key={item.id} item={item} reload={resource.reload} />)}
    <Button label="โหลดงานล่าสุด" disabled={resource.loading} onPress={() => { void resource.reload(); }} /></>;
}

function CourierItem({ item, reload }: { item: CourierShipment; reload(): Promise<void> }) {
  const api = useInspectionApi();
  const action = useInspectionMutation();
  const [pending, setPending] = useState<EvidenceFile | null>(null);
  const upload = async () => {
    const file = pending ?? await pickEvidence(); if (!file) return;
    setPending(file);
    if (await action.mutate(`proof:${item.id}:${file.uri}`, key => api.call(token => api.service.uploadProof(token, item.id, file, key)), () => setPending(null))) {
      setPending(null); await reload();
    }
  };
  return <Card><ThemedText type="subtitle">คำสั่งซื้อ #{item.order_id}</ThemedText><ThemedText>{item.courier_delivered_at ? 'ยืนยันส่งถึงศูนย์แล้ว' : 'รอส่งถึงศูนย์'}</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{item.proofs.map(proof => <Image key={proof.id} source={api.service.privateImageSource(api.token, proof)} style={{ width: 96, height: 96 }} cachePolicy="none" accessibilityLabel="หลักฐานส่งถึงศูนย์" />)}</View>
    {action.error && <ThemedText accessibilityRole="alert">{action.error}</ThemedText>}
    {!item.courier_delivered_at && <><Button label={pending ? 'ลองส่งรูปเดิมอีกครั้ง' : 'แนบรูปส่งถึงศูนย์ (JPEG/PNG)'} busy={action.busy} disabled={item.proofs.length >= 3} onPress={() => { void upload(); }} />
      <Button label="ยืนยันส่งถึงศูนย์แล้ว" variant="primary" busy={action.busy} disabled={item.proofs.length === 0 || !!pending} onPress={() => {
        void action.mutate(`deliver:${item.id}`, key => api.call(token => api.service.confirmDelivery(token, item.id, key, item.proofs.map(proof => proof.id)))).then(ok => { if (ok) void reload(); });
      }} /></>}
  </Card>;
}

function Admin() {
  const api = useInspectionApi();
  const [offset, setOffset] = useState(0);
  const [courierOffset, setCourierOffset] = useState(0);
  const couriers = useResource(useCallback(() => api.call(token => api.service.couriers(token, courierOffset)), [api, courierOffset]));
  const resource = useResource(useCallback(() => api.call(token => api.service.adminOrders(token, offset)), [api, offset]));
  return <><Status {...resource} /><Status {...couriers} />{resource.data?.items.length === 0 && <EmptyState title="ไม่มีรายการรอส่งเข้าศูนย์" />}
    {couriers.data?.items.length === 0 && <EmptyState title="ยังไม่มีบัญชีผู้ขนส่งที่พร้อมรับงาน" />}
    {resource.data?.items.map(item => <Assignment key={item.id} id={item.id} couriers={couriers.data?.items ?? []}><ThemedText type="subtitle">#{item.id} · {item.product.name}</ThemedText></Assignment>)}
    <Card><ThemedText>รายชื่อผู้ขนส่ง หน้า {Math.floor(courierOffset / 20) + 1}</ThemedText>
      {courierOffset > 0 && <Button label="ผู้ขนส่งหน้าก่อน" disabled={couriers.loading} onPress={() => setCourierOffset(value => value - 20)} />}
      {couriers.data && courierOffset + couriers.data.items.length < couriers.data.total && <Button label="ผู้ขนส่งหน้าถัดไป" disabled={couriers.loading} onPress={() => setCourierOffset(value => value + 20)} />}
    </Card>
    {offset > 0 && <Button label="หน้าก่อนหน้า" onPress={() => setOffset(value => Math.max(0, value - 20))} />}
    {resource.data && offset + resource.data.items.length < resource.data.total && <Button label="หน้าถัดไป" onPress={() => setOffset(value => value + 20)} />}
  </>;
}

function Assignment({ id, couriers, children }: PropsWithChildren<{ id: number; couriers: { id: number; name: string }[] }>) {
  const api = useInspectionApi();
  const action = useInspectionMutation();
  const [courier, setCourier] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const valid = courier !== null && couriers.some(item => item.id === courier);
  return <Card>{children}<ThemedText>เลือกผู้ขนส่ง</ThemedText>{couriers.map(item => <Button key={item.id} label={item.name} variant={item.id === courier ? 'primary' : 'secondary'} disabled={action.busy} onPress={() => { setCourier(item.id); setSaved(false); }} />)}
    {action.error && <ThemedText accessibilityRole="alert">{action.error}</ThemedText>}{saved && <ThemedText>มอบหมายผู้ขนส่งแล้ว</ThemedText>}
    <Button label="ยืนยันมอบหมาย Courier" variant="primary" busy={action.busy} disabled={!valid || saved} onPress={() => {
      if (courier !== null) void action.mutate(`assign:${id}:${courier}`, key => api.call(token => api.service.assignCourier(token, id, courier, key))).then(ok => { if (ok) setSaved(true); });
    }} />
  </Card>;
}
