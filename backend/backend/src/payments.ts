import { createHmac, randomUUID, timingSafeEqual, publicEncrypt, constants } from 'node:crypto';
export type PaymentMethod='MANUAL'|'MPESA'|'EMOLA'|'MOCK';
export type ProviderStatus='PENDING'|'PROCESSING'|'PAID'|'FAILED'|'CANCELLED'|'REFUNDED'|'EXPIRED';
export type ChargeInput={amount:string;currency:string;phone:string;reference:string;idempotencyKey:string;method:PaymentMethod};
export type ChargeResult={providerReference:string;status:ProviderStatus;raw:unknown};
export type ProviderConfig={provider?:string;baseUrl?:string;token?:string;walletId?:string;appId?:string;webhookSecret?:string};
export interface PaymentProvider{name:string;createCharge(input:ChargeInput):Promise<ChargeResult>;query?(providerReference:string):Promise<ChargeResult>;refund?(providerReference:string,amount:string):Promise<ChargeResult>}
const digits=(v:string)=>v.replace(/\D/g,''); const localPhone=(v:string)=>digits(v).replace(/^258/,''); const intlPhone=(v:string)=>digits(v).startsWith('258')?digits(v):`258${digits(v)}`;
export function mapStatus(value:unknown):ProviderStatus{const s=String(value||'').toLowerCase();if(['paid','success','successful','completed','confirmed'].includes(s))return'PAID';if(['failed','error','declined'].includes(s))return'FAILED';if(['cancelled','canceled'].includes(s))return'CANCELLED';if(['refunded','reversed'].includes(s))return'REFUNDED';if(s==='expired')return'EXPIRED';if(['processing','initiated'].includes(s))return'PROCESSING';return'PENDING'}
class MockProvider implements PaymentProvider{name='mock';async createCharge(i:ChargeInput){const paid=process.env.MOCK_PAYMENT_AUTO_SUCCESS==='true';return{providerReference:`mock_${randomUUID()}`,status:(paid?'PAID':'PROCESSING') as ProviderStatus,raw:{sandbox:true,method:i.method}}}}
class PagarProvider implements PaymentProvider{name='pagar';private base=process.env.PAYMENT_API_BASE_URL||'https://api.pagar.co.mz';private key=process.env.PAYMENT_API_KEY||'';private async request(path:string,init:RequestInit){if(!this.key)throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');const r=await fetch(`${this.base.replace(/\/$/,'')}${path}`,{...init,headers:{authorization:`Bearer ${this.key}`,'content-type':'application/json',accept:'application/json',...(init.headers||{})},signal:AbortSignal.timeout(15000)});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.message||d?.error||`PAYMENT_HTTP_${r.status}`);return d}async createCharge(i:ChargeInput){const raw:any=await this.request(process.env.PAYMENT_CREATE_PATH||'/api/v1/payments',{method:'POST',headers:{'idempotency-key':i.idempotencyKey},body:JSON.stringify({amount:Number(i.amount),currency:i.currency==='MT'?'MZN':i.currency,payment_method:i.method.toLowerCase(),phone:localPhone(i.phone),reference:i.reference})});return{providerReference:String(raw.id||raw.transaction_id||raw.reference||i.reference),status:mapStatus(raw.status),raw}}async query(providerReference:string){const raw:any=await this.request(`${process.env.PAYMENT_STATUS_PATH||'/api/v1/payments/'}${encodeURIComponent(providerReference)}`,{method:'GET'});return{providerReference,status:mapStatus(raw.status),raw}}}

class PayTedProvider implements PaymentProvider{
  name='payted';
  private base:string;
  private key:string;
  private appId:string;
  private debitPath:string;
  private statusPath:string;
  constructor(cfg:ProviderConfig={}){
    this.base=(cfg.baseUrl||process.env.PAYTED_API_BASE_URL||'https://pay.ted.co.mz/api').replace(/\/$/,'');
    this.key=cfg.token||process.env.PAYTED_API_KEY||'';
    this.appId=cfg.appId||process.env.PAYTED_APP_ID||'';
    this.debitPath=process.env.PAYTED_DEBIT_PATH||'/debit';
    this.statusPath=process.env.PAYTED_STATUS_PATH||'/debit/';
  }
  private async request(path:string,init:RequestInit={}){
    if(!this.key||!this.appId) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
    const r=await fetch(`${this.base}${path}`,{
      ...init,
      headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json',Accept:'application/json',...(init.headers||{})},
      signal:AbortSignal.timeout(15000)
    });
    const raw:any=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(raw?.message||raw?.error||`PAYMENT_HTTP_${r.status}`);
    return raw;
  }
  async createCharge(i:ChargeInput){
    if(i.method!=='EMOLA'&&i.method!=='MPESA') throw new Error('PAYMENT_METHOD_UNSUPPORTED');
    if(i.currency!=='MT') throw new Error('PAYTED_REQUIRES_MT');
    const raw:any=await this.request(this.debitPath,{
      method:'POST',
      headers:{'Idempotency-Key':i.idempotencyKey},
      body:JSON.stringify({
        app_id:Number(this.appId),
        valor_total:Number(i.amount),
        referencia_externa:i.reference,
        metodo:i.method.toLowerCase(),
        numero_cliente:localPhone(i.phone)
      })
    });
    const data:any=raw?.debit||raw?.payment||raw?.data||raw;
    return {
      providerReference:String(data?.transacaoId||data?.transaction_id||data?.id||raw?.transacaoId||i.reference),
      status:mapStatus(data?.status||raw?.status),
      raw
    };
  }
  async query(providerReference:string){
    const raw:any=await this.request(`${this.statusPath}${encodeURIComponent(providerReference)}`,{method:'GET'});
    const data:any=raw?.debit||raw?.payment||raw?.data||raw;
    return {providerReference,status:mapStatus(data?.status||raw?.status),raw};
  }
}

class ClicPayProvider implements PaymentProvider{
  name='clicpay';
  private base:string; private token:string; private walletId:string;
  constructor(cfg:ProviderConfig={}){
    this.base=(cfg.baseUrl||process.env.CLICPAY_BASE_URL||'https://clicpay.co.mz').replace(/\/$/,'');
    this.token=cfg.token||process.env.CLICPAY_TOKEN||'';
    this.walletId=cfg.walletId||process.env.CLICPAY_WALLET_ID||'';
  }
  private async request(path:string,init:RequestInit={}){
    if(!this.token||!this.walletId) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
    const r=await fetch(`${this.base}${path}`,{...init,headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json',Accept:'application/json',...(init.headers||{})},signal:AbortSignal.timeout(15000)});
    const raw:any=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(raw?.message||raw?.error||`PAYMENT_HTTP_${r.status}`);
    return raw;
  }
  async createCharge(i:ChargeInput){
    if(i.method!=='EMOLA'&&i.method!=='MPESA') throw new Error('PAYMENT_METHOD_UNSUPPORTED');
    if(i.currency!=='MT') throw new Error('CLICPAY_REQUIRES_MT');
    const method=i.method==='EMOLA'?'emola':'mpesa';
    const raw:any=await this.request(`/api/v2/wallets/${encodeURIComponent(this.walletId)}/c2b/${method}`,{method:'POST',headers:{'Idempotency-Key':i.idempotencyKey},body:JSON.stringify({msisdn:localPhone(i.phone),amount:Number(i.amount),reference_description:i.reference,internal_notes:`Atelier ${i.reference}`})});
    const data:any=raw?.data||raw;
    return {providerReference:String(data?.clicpay_reference||data?.transaction_id||data?.id||i.reference),status:mapStatus(data?.status||raw?.status),raw};
  }
  async query(providerReference:string){
    const raw:any=await this.request(`/api/v2/transactions/${encodeURIComponent(providerReference)}/status`,{method:'GET'});
    const data:any=raw?.data||raw;
    return {providerReference,status:mapStatus(data?.status||raw?.status),raw};
  }
}

class MpesaProvider implements PaymentProvider{name='mpesa';private base=(process.env.MPESA_BASE_URL||'https://api.sandbox.vm.co.mz:18352').replace(/\/$/,'');private auth(){const api=process.env.MPESA_API_KEY||'',pub=(process.env.MPESA_PUBLIC_KEY||'').replace(/\\n/g,'\n');if(!api||!pub)throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');return publicEncrypt({key:pub,padding:constants.RSA_PKCS1_PADDING},Buffer.from(api)).toString('base64')}async createCharge(i:ChargeInput){if(i.method!=='MPESA')throw new Error('PAYMENT_METHOD_UNSUPPORTED');if(i.currency!=='MT')throw new Error('MPESA_REQUIRES_MT');const sp=process.env.MPESA_SERVICE_PROVIDER_CODE||'';if(!sp)throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');const r=await fetch(`${this.base}/ipg/v1x/c2bPayment/singleStage/`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${this.auth()}`,'Content-Type':'application/json',Origin:'developer.mpesa.vm.co.mz'},body:JSON.stringify({input_TransactionReference:i.reference.slice(-20),input_CustomerMSISDN:intlPhone(i.phone),input_Amount:Number(i.amount).toFixed(2),input_ThirdPartyReference:i.reference.replace(/[^A-Za-z0-9]/g,'').slice(-20),input_ServiceProviderCode:sp})});const raw:any=await r.json().catch(()=>({}));const ok=r.ok&&raw.output_ResponseCode==='INS-0';return{providerReference:String(raw.output_ConversationID||raw.output_TransactionID||i.reference),status:(ok?'PAID':'FAILED') as ProviderStatus,raw}}}
export function getPaymentProvider(config:ProviderConfig={}):PaymentProvider{const n=(config.provider||process.env.PAYMENT_PROVIDER||'mock').toLowerCase();if(n==='pagar')return new PagarProvider();if(n==='payted')return new PayTedProvider(config);if(n==='clicpay')return new ClicPayProvider(config);if(n==='mpesa')return new MpesaProvider();return new MockProvider()}
export function verifyWebhook(raw:string,signature:string|undefined,secretOverride?:string){const secret=secretOverride||process.env.PAYMENT_WEBHOOK_SECRET||'';if(!secret||!signature)return false;const expected=createHmac('sha256',secret).update(raw).digest('hex'),supplied=signature.replace(/^sha256=/,'');try{return expected.length===supplied.length&&timingSafeEqual(Buffer.from(expected),Buffer.from(supplied))}catch{return false}}
