import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { FixtureProvider, photos } from '../shims/providers';
import { product } from '../shims/catalog';
import { useThemePreference } from '../../src/theme/theme-provider';
import { useTheme } from '../../src/hooks/use-theme';
import { ThemedText } from '../../src/components/themed-text';
import { ProfileScreen } from '../../src/components/profile-screen';
import { LoginScreen } from '../../src/components/login-screen';
import { SellerVerificationScreen } from '../../src/components/seller-verification-screen';
import { ProductListScreen } from '../../src/components/product-list-screen';
import { ProductDetailScreen } from '../../src/components/product-detail-screen';
import { CheckoutScreen } from '../../src/components/checkout-screen';
import { OrdersListScreen } from '../../src/components/orders-list-screen';
import { OrderDetailScreen } from '../../src/components/order-detail-screen';
import { ReceiptScreen } from '../../src/components/receipt-screen';
import { AdminVerificationScreen } from '../../src/components/admin-verification-screen';
import { ProductForm } from '../../src/components/product-form';
import MyProductsScreen from '../../src/app/product/mine';
import { BuyerResultView, CertificateSheet, InspectorQueueView, InspectorWorkView, SellerShipView, UnavailableInspection, type InspectionOutcome } from '../../src/components/inspection/views';
import { WondeeMascot, type MascotVariant } from '../../src/components/wondee/brand';
import { EmptyState, ErrorState, Skeleton } from '../../src/components/wondee/primitives';
import { Card } from '../../src/components/order-ui';
const cert = { number: 'QA-CERT-0042', publicUrl: '', issuedAt: '2026-09-27T06:00:00Z' };
const proof = photos.slice(0,2).map((uri,i) => ({ id: i+1, source: { uri }, label: `หลักฐานตัวอย่าง ${i+1}` }));
const noop = () => {};
function Fixture({ scene }: { scene: string }) {
  const theme = useTheme();
  if (['guest','buyer','seller'].includes(scene)) return <ProfileScreen />;
  if (scene === 'login') return <LoginScreen />;
  if (['form','form-errors','pending','approved','rejected'].includes(scene)) return <SellerVerificationScreen />;
  if (scene === 'catalog') return <ProductListScreen />;
  if (scene === 'detail') return <ProductDetailScreen />;
  if (scene.startsWith('checkout')) return <CheckoutScreen productId={7} />;
  if (scene.startsWith('orders')) return <OrdersListScreen />;
  if (scene.startsWith('order-')) return <OrderDetailScreen orderId={42} />;
  if (scene === 'receipt') return <ReceiptScreen orderId={42} />;
  if (scene === 'admin') return <AdminVerificationScreen />;
  if (scene === 'mine') return <MyProductsScreen />;
  let content;
  if (scene === 'ship') content = <SellerShipView orderId={42} productName={product.productName} />;
  else if (scene === 'inspector-queue') content = <InspectorQueueView items={[{ id: 1, orderId: 42, productName: product.productName, statusLabel: 'รอรับสินค้าเข้าศูนย์' }]} total={1} filter="all" onFilter={noop} />;
  else if (scene.startsWith('inspector-work')) content = <InspectorWorkView productName={product.productName} step={scene.endsWith('1') ? 1 : scene.endsWith('3') ? 3 : 2} photos={proof} error={scene.endsWith('3') ? 'บริการบันทึกผลยังไม่พร้อมใช้งาน' : undefined} />;
  else if (scene.startsWith('result-')) content = <BuyerResultView outcome={scene === 'result-decision' ? 'PASS' : scene.slice(7) as InspectionOutcome} certificateDecision={scene === 'result-decision'} canDecide={scene === 'result-decision'} onDecision={scene === 'result-decision' ? noop : undefined} summary="ตรวจพบสภาพตามรายละเอียดที่บันทึกไว้ ผิวผ้าและตะเข็บอยู่ในสภาพดี มีรอยใช้งานบริเวณชายเสื้อเล็กน้อย โปรดพิจารณาภาพหลักฐานประกอบก่อนตัดสินใจ" inspectedAt={cert.issuedAt} photos={proof} certificate={cert} nextAction={['result-FAKE','result-NOT_AS_DESCRIBED'].includes(scene) ? 'RETURN_TO_SELLER' : 'WAIT_BUYER_DECISION'} />;
  else if (scene === 'certificate') content = <><UnavailableInspection /><CertificateSheet visible enabled={false} outcome="PASS" certificate={cert} onClose={noop} /></>;
  else if (scene === 'create' || scene === 'edit') content = <Card><ThemedText type="title">{scene === 'create' ? 'ลงขายสินค้า' : 'แก้ไขสินค้า'}</ThemedText><ProductForm mode={scene} submitDisabled onSubmit={noop} initialValues={scene === 'edit' ? { name: product.productName, description: product.description, price: product.price, size: 'M', condition: 'GOOD', category: 'เสื้อผ้า', categoryId: 1, brand: 'ไม่ระบุแบรนด์', brandId: 1, images: photos.slice(0,2) } : undefined} /></Card>;
  else content = <><ThemedText type="title">Wondee · สถานะและมาสคอต</ThemedText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{(['neutral','courier','inspector','pass','minor','discrepancy','fake','seal'] as MascotVariant[]).map(variant => <View key={variant} style={{ alignItems: 'center', gap: 8 }}><WondeeMascot variant={variant} size={80} animate /><ThemedText type="small">{variant}</ThemedText></View>)}</View><Skeleton height={150} /><EmptyState title="ยังไม่มีรายการ" detail="รายการของคุณจะแสดงที่นี่" /><ErrorState title="เชื่อมต่อไม่ได้" detail="กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" /></>;
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 800, width: '100%', alignSelf: 'center' }}>{content}</ScrollView>;
}
export default function VisualQA() {
  const params = useLocalSearchParams<{ scene?: string; theme?: string }>();
  const scene = params.scene ?? 'buyer';
  const [ready, setReady] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(frame); }, []);
  const { setPreference, scheme, ready: themeReady } = useThemePreference();
  useEffect(() => { setPreference(params.theme === 'light' ? 'light' : 'dark'); }, [params.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  return <View style={{ flex: 1 }}><View testID={ready && themeReady && scheme === (params.theme === 'light' ? 'light' : 'dark') ? 'qa-ready' : undefined} style={{ backgroundColor: '#fbbf24', padding: 4 }}><ThemedText style={{ color: '#111827', fontSize: 12, textAlign: 'center' }}>QA FIXTURE · {scene} · ไม่มี API/การบันทึกจริง</ThemedText></View><FixtureProvider scene={scene}><Fixture key={scene} scene={scene} /></FixtureProvider></View>;
}
