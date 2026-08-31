#include "perception.h"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <condition_variable>
#include <commctrl.h>
#include <iostream>
#include <d3d11.h>
#include <dwmapi.h>
#include <dxgi.h>
#include <future>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <thread>
#include <uiautomation.h>
#include <wincodec.h>
#include <wincrypt.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <winrt/Windows.Graphics.DirectX.h>

using namespace winrt::Windows::Graphics::Capture;
using namespace winrt::Windows::Graphics::DirectX;
using namespace winrt::Windows::Graphics::DirectX::Direct3D11;
std::string utf8(const winrt::hstring &s) { return winrt::to_string(s); }
void text(Json &j, const wchar_t *key, const std::string &s) {
  j.SetNamedValue(key, Value::CreateStringValue(winrt::to_hstring(s)));
}
void number(Json &j, const wchar_t *key, double n) {
  j.SetNamedValue(key, Value::CreateNumberValue(n));
}
void jsonBoolean(Json &j, const wchar_t *key, bool b) {
  j.SetNamedValue(key, Value::CreateBooleanValue(b));
}
Json rectJson(double x, double y, double w, double h) {
  Json r;
  number(r, L"x", x);
  number(r, L"y", y);
  number(r, L"width", w);
  number(r, L"height", h);
  return r;
}
std::string uuid() {
  GUID g;
  winrt::check_hresult(CoCreateGuid(&g));
  wchar_t value[40];
  StringFromGUID2(g, value, 40);
  return utf8(winrt::hstring(value)).substr(1, 36);
}
std::string nowIso() {
  SYSTEMTIME t;
  GetSystemTime(&t);
  char b[32];
  sprintf_s(b, "%04u-%02u-%02uT%02u:%02u:%02u.%03uZ", t.wYear, t.wMonth, t.wDay,
            t.wHour, t.wMinute, t.wSecond, t.wMilliseconds);
  return b;
}
static ULONGLONG processStart(DWORD pid) {
  HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!h)
    return 0;
  FILETIME start, exit, kernel, user;
  BOOL ok = GetProcessTimes(h, &start, &exit, &kernel, &user);
  CloseHandle(h);
  return ok ? (static_cast<ULONGLONG>(start.dwHighDateTime) << 32) |
                  start.dwLowDateTime
            : 0;
}
static bool accessible(HWND hwnd, DWORD excludedPid) {
  DWORD pid = 0, session = 0, ours = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  if (!pid || pid == excludedPid || !IsWindowVisible(hwnd) || IsIconic(hwnd) ||
      GetAncestor(hwnd, GA_ROOT) != hwnd)
    return false;
  DWORD affinity = 0;
  if (GetWindowDisplayAffinity(hwnd, &affinity) && affinity)
    return false;
  DWORD cloaked = 0;
  DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof(cloaked));
  if (cloaked)
    return false;
  if (!ProcessIdToSessionId(pid, &session) ||
      !ProcessIdToSessionId(GetCurrentProcessId(), &ours) || session != ours)
    return false;
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid),
         token = nullptr;
  if (!process)
    return false;
  bool allowed = false;
  if (OpenProcessToken(process, TOKEN_QUERY, &token)) {
    DWORD size = 0;
    GetTokenInformation(token, TokenIntegrityLevel, nullptr, 0, &size);
    std::vector<BYTE> b(size);
    if (GetTokenInformation(token, TokenIntegrityLevel, b.data(), size,
                            &size)) {
      auto sid = reinterpret_cast<TOKEN_MANDATORY_LABEL *>(b.data())->Label.Sid;
      auto rid = *GetSidSubAuthority(sid, *GetSidSubAuthorityCount(sid) - 1);
      allowed = rid <= SECURITY_MANDATORY_MEDIUM_RID;
    }
    CloseHandle(token);
  }
  CloseHandle(process);
  return allowed;
}
static void defaultDesktop() {
  HDESK desktop = OpenInputDesktop(0, FALSE, DESKTOP_READOBJECTS);
  if (!desktop)
    throw std::runtime_error("computer_desktop_unavailable");
  wchar_t name[128];
  DWORD length = 0;
  bool ok =
      GetUserObjectInformationW(desktop, UOI_NAME, name, sizeof(name), &length);
  CloseDesktop(desktop);
  if (!ok || _wcsicmp(name, L"Default"))
    throw std::runtime_error("computer_desktop_unavailable");
}
static RECT windowBounds(HWND hwnd) {
  RECT r{};
  if (FAILED(DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &r,
                                   sizeof(r))))
    GetWindowRect(hwnd, &r);
  return r;
}
// 仅在一次采集中监听目标进程中的指定窗口，不订阅全桌面
struct GeometryState {
  HWND hwnd;
  RECT initial;
  UINT dpi;
  std::atomic_bool changed{false};
  std::atomic_bool stopped{false};
};
static thread_local GeometryState *geometryState = nullptr;
static void CALLBACK geometryChanged(HWINEVENTHOOK, DWORD, HWND hwnd,
                                     LONG objectId, LONG, DWORD, DWORD) {
  auto state = geometryState;
  if (!state || hwnd != state->hwnd || objectId != OBJID_WINDOW)
    return;
  auto bounds = windowBounds(hwnd);
  if (!EqualRect(&bounds, &state->initial) ||
      GetDpiForWindow(hwnd) != state->dpi)
    state->changed = true;
}
class GeometryGuard {
  std::shared_ptr<GeometryState> state;
  std::thread worker;

public:
  GeometryGuard(HWND hwnd, DWORD pid, RECT initial, UINT dpi)
      : state(std::make_shared<GeometryState>()) {
    state->hwnd = hwnd;
    state->initial = initial;
    state->dpi = dpi;
    std::promise<bool> initialized;
    auto ready = initialized.get_future();
    worker = std::thread(
        [current = state, pid, init = std::move(initialized)]() mutable {
          geometryState = current.get();
          auto hook = SetWinEventHook(
              EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, nullptr,
              geometryChanged, pid, 0, WINEVENT_OUTOFCONTEXT);
          init.set_value(hook != nullptr);
          if (!hook)
            return;
          while (!current->stopped) {
            MSG message;
            while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
              TranslateMessage(&message);
              DispatchMessageW(&message);
            }
            MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
          }
          UnhookWinEvent(hook);
          geometryState = nullptr;
        });
    if (!ready.get()) {
      worker.join();
      throw std::runtime_error("computer_coordinate_monitor_unavailable");
    }
  }
  ~GeometryGuard() {
    state->stopped = true;
    if (worker.joinable())
      worker.join();
  }
  bool changed() const { return state->changed; }
};
struct Perception::WindowLife {
  GraphicsCaptureItem item{nullptr};
  std::atomic_bool valid{true};
};
Perception::Perception(DWORD pid, const std::wstring &dir)
    : excludedPid(pid), directory(dir) {}
void Perception::release() {
  invalidateNodes(); uiaCache.reset();
  selected.reset();
  life.reset();
  targets.clear();
  registered.clear();
}
bool Perception::targetValid() {
  try {
    defaultDesktop();
  } catch (...) {
    release();
    return false;
  }
  DWORD currentPid = 0;
  if (selected)
    GetWindowThreadProcessId(selected->hwnd, &currentPid);
  bool valid = selected && currentPid == selected->pid && life && life->valid &&
               accessible(selected->hwnd, excludedPid) &&
               processStart(selected->pid) == selected->processStart;
  if (!valid)
    release();
  return valid;
}
Json Perception::list() {
  defaultDesktop();
  targets.clear();
  registered.clear();
  struct Context {
    Perception *p;
  } context{this};
  EnumWindows(
      [](HWND hwnd, LPARAM data) -> BOOL {
        auto p = reinterpret_cast<Context *>(data)->p;
        if (p->targets.size() >= 100 || !accessible(hwnd, p->excludedPid))
          return TRUE;
        wchar_t title[1025];
        int length = GetWindowTextW(hwnd, title, 1025);
        if (!length)
          return TRUE;
        DWORD pid = 0;
        GetWindowThreadProcessId(hwnd, &pid);
        auto start = processStart(pid);
        if (!start)
          return TRUE;
        try {
          auto state = std::make_shared<WindowLife>();
          auto factory =
              winrt::get_activation_factory<GraphicsCaptureItem,
                                            IGraphicsCaptureItemInterop>();
          winrt::check_hresult(factory->CreateForWindow(
              hwnd, winrt::guid_of<GraphicsCaptureItem>(),
              winrt::put_abi(state->item)));
          std::weak_ptr<WindowLife> weak = state;
          state->item.Closed([weak](auto &&, auto &&) {
            if (auto current = weak.lock())
              current->valid = false;
          });
          auto id = uuid();
          p->registered.emplace(id, state);
          p->targets.push_back(
              {hwnd, pid, start, id, std::wstring(title, length)});
        } catch (...) { /* 无法建立窗口生命周期时不提供该窗口 */
        }
        return TRUE;
      },
      reinterpret_cast<LPARAM>(&context));
  Array sources;
  for (const auto &target : targets) {
    Json s;
    text(s, L"sourceId", target.id);
    text(s, L"title", utf8(winrt::hstring(target.title)));
    sources.Append(s);
  }
  Json result;
  result.SetNamedValue(L"sources", sources);
  return result;
}
Json Perception::select(const std::string &id) {
  auto it = std::find_if(targets.begin(), targets.end(),
                         [&](const Target &t) { return t.id == id; });
  if (it == targets.end() || !accessible(it->hwnd, excludedPid) ||
      processStart(it->pid) != it->processStart)
    throw std::runtime_error("computer_window_unavailable");
  auto registration = registered.find(id);
  if (registration == registered.end() || !registration->second->valid)
    throw std::runtime_error("computer_window_unavailable");
  selected = std::make_unique<Target>(*it);
  life = registration->second;
  Json r;
  text(r, L"title", utf8(winrt::hstring(it->title)));
  return r;
}
Pixels resizePixels(const Pixels &p, int w, int h) {
  Pixels result{w, h,
                std::vector<unsigned char>(static_cast<size_t>(w) * h * 4)};
  for (int y = 0; y < h; ++y)
    for (int x = 0; x < w; ++x) {
      double sx =
          std::clamp((x + .5) * p.width / w - .5, 0., double(p.width - 1));
      double sy =
          std::clamp((y + .5) * p.height / h - .5, 0., double(p.height - 1));
      int x0 = static_cast<int>(sx), y0 = static_cast<int>(sy),
          x1 = std::min(x0 + 1, p.width - 1),
          y1 = std::min(y0 + 1, p.height - 1);
      for (int c = 0; c < 4; ++c) {
        double top = p.bgra[(y0 * p.width + x0) * 4 + c] * (1 - (sx - x0)) +
                     p.bgra[(y0 * p.width + x1) * 4 + c] * (sx - x0);
        double bottom = p.bgra[(y1 * p.width + x0) * 4 + c] * (1 - (sx - x0)) +
                        p.bgra[(y1 * p.width + x1) * 4 + c] * (sx - x0);
        result.bgra[(y * w + x) * 4 + c] = static_cast<unsigned char>(
            std::round(top * (1 - (sy - y0)) + bottom * (sy - y0)));
      }
    }
  return result;
}
std::vector<float> normalizedPixels(const Pixels &p, int w, int h) {
  auto image = resizePixels(p, w, h);
  std::vector<float> result(static_cast<size_t>(w) * h * 3);
  for (int c = 0; c < 3; ++c)
    for (int i = 0; i < w * h; ++i)
      result[c * w * h + i] = (image.bgra[i * 4 + c] / 255.f - .5f) / .5f;
  return result;
}
std::string pngDataUrl(const Pixels &pixels) {
  winrt::com_ptr<IWICImagingFactory> factory;
  winrt::check_hresult(CoCreateInstance(CLSID_WICImagingFactory, nullptr,
                                        CLSCTX_INPROC_SERVER,
                                        IID_PPV_ARGS(factory.put())));
  winrt::com_ptr<IStream> stream;
  winrt::check_hresult(CreateStreamOnHGlobal(nullptr, TRUE, stream.put()));
  winrt::com_ptr<IWICBitmapEncoder> encoder;
  winrt::check_hresult(
      factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, encoder.put()));
  winrt::check_hresult(
      encoder->Initialize(stream.get(), WICBitmapEncoderNoCache));
  winrt::com_ptr<IWICBitmapFrameEncode> frame;
  winrt::check_hresult(encoder->CreateNewFrame(frame.put(), nullptr));
  winrt::check_hresult(frame->Initialize(nullptr));
  winrt::check_hresult(frame->SetSize(pixels.width, pixels.height));
  auto format = GUID_WICPixelFormat32bppBGRA;
  winrt::check_hresult(frame->SetPixelFormat(&format));
  winrt::check_hresult(frame->WritePixels(
      pixels.height, pixels.width * 4, static_cast<UINT>(pixels.bgra.size()),
      const_cast<BYTE *>(pixels.bgra.data())));
  winrt::check_hresult(frame->Commit());
  winrt::check_hresult(encoder->Commit());
  STATSTG stat{};
  winrt::check_hresult(stream->Stat(&stat, STATFLAG_NONAME));
  if (stat.cbSize.QuadPart > 5 * 1024 * 1024)
    throw std::runtime_error("computer_image_too_large");
  HGLOBAL memory;
  winrt::check_hresult(GetHGlobalFromStream(stream.get(), &memory));
  auto p = static_cast<BYTE *>(GlobalLock(memory));
  DWORD size = 0;
  CryptBinaryToStringA(p, stat.cbSize.LowPart,
                       CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr,
                       &size);
  std::string encoded(size, '\0');
  CryptBinaryToStringA(p, stat.cbSize.LowPart,
                       CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF,
                       encoded.data(), &size);
  GlobalUnlock(memory);
  encoded.resize(size);
  return "data:image/png;base64," + encoded;
}
static Pixels capture(const GraphicsCaptureItem &item, bool diagnostics = false) {
  const auto stage = [diagnostics](const char *name) { if (diagnostics) fprintf(stderr, "capture fixture: %s\n", name); };
  stage("device");
  winrt::com_ptr<ID3D11Device> device;
  winrt::com_ptr<ID3D11DeviceContext> ctx;
  D3D_FEATURE_LEVEL level;
  winrt::check_hresult(
      D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
                        D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0,
                        D3D11_SDK_VERSION, device.put(), &level, ctx.put()));
  auto dxgi = device.as<IDXGIDevice>();
  stage("interop_device");
  winrt::com_ptr<IInspectable> inspectable;
  winrt::check_hresult(
      CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(), inspectable.put()));
  stage("frame_pool");
  auto pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
      inspectable.as<IDirect3DDevice>(),
      DirectXPixelFormat::B8G8R8A8UIntNormalized, 1, item.Size());
  struct FrameState {
    std::mutex mutex;
    std::condition_variable cv;
    Direct3D11CaptureFrame frame{nullptr};
    bool closed = false;
  };
  auto state = std::make_shared<FrameState>();
  auto token = pool.FrameArrived([state](auto const &sender, auto &&) {
    std::lock_guard lock(state->mutex);
    if (state->closed)
      return;
    try {
      if (!state->frame)
        state->frame = sender.TryGetNextFrame();
    } catch (...) {
    }
    state->cv.notify_one();
  });
  stage("capture_session");
  auto session = pool.CreateCaptureSession(item);
  session.IsCursorCaptureEnabled(false);
  stage("start_capture");
  session.StartCapture();
  bool received = false;
  Direct3D11CaptureFrame frame{nullptr};
  {
    std::unique_lock lock(state->mutex);
    received = state->cv.wait_for(lock, std::chrono::seconds(5),
                                  [&] { return !!state->frame; });
    state->closed = true;
    frame = state->frame;
  }
  pool.FrameArrived(token);
  session.Close();
  if (!received) {
    pool.Close();
    throw std::runtime_error("computer_capture_timeout");
  }
  stage("frame_surface");
  auto access = frame.Surface()
                    .as<Windows::Graphics::DirectX::Direct3D11::
                            IDirect3DDxgiInterfaceAccess>();
  winrt::com_ptr<ID3D11Texture2D> texture;
  winrt::check_hresult(access->GetInterface(IID_PPV_ARGS(texture.put())));
  auto size = frame.ContentSize();
  if (size.Width <= 0 || size.Height <= 0 ||
      static_cast<int64_t>(size.Width) * size.Height > 40000000)
    throw std::runtime_error("computer_image_too_large");
  D3D11_TEXTURE2D_DESC desc;
  texture->GetDesc(&desc);
  if (size.Width > static_cast<int>(desc.Width) ||
      size.Height > static_cast<int>(desc.Height))
    throw std::runtime_error("computer_observation_stale");
  desc.Usage = D3D11_USAGE_STAGING;
  desc.BindFlags = 0;
  desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
  desc.MiscFlags = 0;
  winrt::com_ptr<ID3D11Texture2D> staging;
  stage("staging_texture");
  winrt::check_hresult(device->CreateTexture2D(&desc, nullptr, staging.put()));
  ctx->CopyResource(staging.get(), texture.get());
  D3D11_MAPPED_SUBRESOURCE mapped;
  stage("map_pixels");
  winrt::check_hresult(ctx->Map(staging.get(), 0, D3D11_MAP_READ, 0, &mapped));
  Pixels p{size.Width, size.Height,
           std::vector<unsigned char>(static_cast<size_t>(size.Width) *
                                      size.Height * 4)};
  for (int y = 0; y < p.height; ++y)
    memcpy(p.bgra.data() + y * p.width * 4,
           static_cast<BYTE *>(mapped.pData) + y * mapped.RowPitch,
           p.width * 4);
  ctx->Unmap(staging.get(), 0);
  frame.Close();
  pool.Close();
  return p;
}
struct UiaEntry {
  winrt::com_ptr<IUIAutomationElement> element;
  std::vector<LONG> runtimeId;
  RECT bounds;
  Array actions;
};
static std::vector<LONG> runtimeIdentity(IUIAutomationElement *element) {
  SAFEARRAY *raw = nullptr;
  winrt::check_hresult(element->GetRuntimeId(&raw));
  if (!raw) throw std::runtime_error("computer_uia_identity_unavailable");
  LONG first = 0, last = -1;
  SafeArrayGetLBound(raw, 1, &first); SafeArrayGetUBound(raw, 1, &last);
  std::vector<LONG> id;
  for (LONG i = first; i <= last && i-first < 128; ++i) {
    LONG value = 0; SafeArrayGetElement(raw, &i, &value); id.push_back(value);
  }
  SafeArrayDestroy(raw);
  if (id.empty() || last-first >= 128) throw std::runtime_error("computer_uia_identity_unavailable");
  return id;
}
template<class T> static winrt::com_ptr<T> pattern(IUIAutomationElement *element, PATTERNID id) {
  winrt::com_ptr<T> value;
  element->GetCurrentPatternAs(id, __uuidof(T), value.put_void());
  return value;
}
static Array supportedActions(IUIAutomationElement *element) {
  Array actions;
  BOOL enabled = FALSE, password = TRUE, off = TRUE;
  element->get_CurrentIsEnabled(&enabled); element->get_CurrentIsPassword(&password); element->get_CurrentIsOffscreen(&off);
  if (!enabled || password || off) return actions;
  auto add = [&](const wchar_t *name) { actions.Append(Value::CreateStringValue(name)); };
  if (pattern<IUIAutomationInvokePattern>(element, UIA_InvokePatternId)) add(L"uia_invoke");
  if (pattern<IUIAutomationTogglePattern>(element, UIA_TogglePatternId)) add(L"uia_toggle");
  if (pattern<IUIAutomationSelectionItemPattern>(element, UIA_SelectionItemPatternId)) add(L"uia_select");
  if (auto scroll = pattern<IUIAutomationScrollPattern>(element, UIA_ScrollPatternId)) {
    BOOL horizontal = FALSE, vertical = FALSE;
    scroll->get_CurrentHorizontallyScrollable(&horizontal); scroll->get_CurrentVerticallyScrollable(&vertical);
    if (horizontal || vertical) add(L"uia_scroll");
  }
  if (auto expand = pattern<IUIAutomationExpandCollapsePattern>(element, UIA_ExpandCollapsePatternId)) {
    ExpandCollapseState state = ExpandCollapseState_LeafNode;
    if (SUCCEEDED(expand->get_CurrentExpandCollapseState(&state)) && state != ExpandCollapseState_LeafNode) add(L"uia_expand_collapse");
  }
  CONTROLTYPEID type = 0; element->get_CurrentControlType(&type);
  auto value = pattern<IUIAutomationValuePattern>(element, UIA_ValuePatternId);
  BOOL readOnly = TRUE;
  if (type == UIA_EditControlTypeId && value && SUCCEEDED(value->get_CurrentIsReadOnly(&readOnly)) && !readOnly) add(L"uia_set_value");
  return actions;
}
struct UiaSnapshot {
  Array nodes;
  std::unordered_map<std::string, UiaEntry> entries;
  std::vector<RECT> passwords;
  bool truncated = false;
  std::string at;
};
struct Perception::UiaCache {
  UiaSnapshot snapshot;
  std::string observationId;
  unsigned epoch;
};
static UiaSnapshot readUia(HWND hwnd, const RECT &bounds) {
  winrt::init_apartment(winrt::apartment_type::multi_threaded);
  UiaSnapshot result;
  result.at = nowIso();
  winrt::com_ptr<IUIAutomation> automation;
  winrt::check_hresult(CoCreateInstance(CLSID_CUIAutomation8, nullptr,
                                        CLSCTX_INPROC_SERVER,
                                        IID_PPV_ARGS(automation.put())));
  auto timeouts = automation.as<IUIAutomation2>();
  timeouts->put_ConnectionTimeout(1000);
  timeouts->put_TransactionTimeout(2000);
  winrt::com_ptr<IUIAutomationElement> root;
  winrt::check_hresult(automation->ElementFromHandle(hwnd, root.put()));
  winrt::com_ptr<IUIAutomationTreeWalker> walker;
  winrt::check_hresult(automation->get_ControlViewWalker(walker.put()));
  struct Entry {
    winrt::com_ptr<IUIAutomationElement> element;
    int parent;
    int depth;
  };
  std::vector<Entry> queue{{root, -1, 0}};
  size_t chars = 0;
  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
  for (size_t i = 0; i < queue.size(); ++i) {
    if (i >= 1000 || std::chrono::steady_clock::now() > deadline) {
      result.truncated = true;
      break;
    }
    auto entry = queue[i];
    BOOL off = TRUE, password = TRUE, enabled = FALSE;
    RECT r{};
    entry.element->get_CurrentIsOffscreen(&off);
    entry.element->get_CurrentIsPassword(&password);
    entry.element->get_CurrentBoundingRectangle(&r);
    if (password && !off && (r.right <= r.left || r.bottom <= r.top))
      throw std::runtime_error("computer_password_bounds_unavailable");
    RECT intersect{};
    if (off || !IntersectRect(&intersect, &r, &bounds))
      continue;
    Json node;
    text(node, L"id", std::to_string(i));
    if (entry.parent < 0)
      node.SetNamedValue(L"parentId", Value::CreateNullValue());
    else
      text(node, L"parentId", std::to_string(entry.parent));
    CONTROLTYPEID type = 0;
    entry.element->get_CurrentControlType(&type);
    text(node, L"controlType", std::to_string(type));
    entry.element->get_CurrentIsEnabled(&enabled);
    jsonBoolean(node, L"enabled", enabled);
    jsonBoolean(node, L"password", password);
    node.SetNamedValue(
        L"bounds", rectJson(r.left, r.top, r.right - r.left, r.bottom - r.top));
    std::string name, id;
    if (password)
      result.passwords.push_back(r);
    else {
      BSTR raw = nullptr;
      if (SUCCEEDED(entry.element->get_CurrentName(&raw)) && raw) {
        name = utf8(winrt::hstring(raw));
        SysFreeString(raw);
      }
      raw = nullptr;
      if (SUCCEEDED(entry.element->get_CurrentAutomationId(&raw)) && raw) {
        id = utf8(winrt::hstring(raw));
        SysFreeString(raw);
      }
    }
    const auto typeBytes = std::to_string(type).size();
    if (name.size() + id.size() + chars + typeBytes > 60000) {
      result.truncated = true;
      name.clear();
      id.clear();
    }
    chars += name.size() + id.size() + typeBytes;
    text(node, L"name", name);
    text(node, L"automationId", id);
    result.nodes.Append(node);
    auto actions = supportedActions(entry.element.get());
    if (actions.Size()) {
      try {
        result.entries.emplace(std::to_string(i), UiaEntry{entry.element, runtimeIdentity(entry.element.get()), r, actions});
        node.SetNamedValue(L"supportedActions", actions);
      } catch (...) { /* 身份不可核验的节点只提供只读观察 */ }
    }
    if (entry.depth >= 20) {
      result.truncated = true;
      continue;
    }
    winrt::com_ptr<IUIAutomationElement> child;
    walker->GetFirstChildElement(entry.element.get(), child.put());
    while (child) {
      if (queue.size() >= 1000) {
        result.truncated = true;
        break;
      }
      queue.push_back({child, static_cast<int>(i), entry.depth + 1});
      winrt::com_ptr<IUIAutomationElement> next;
      walker->GetNextSiblingElement(child.get(), next.put());
      child = std::move(next);
    }
  }
  return result;
}
void testUiaFixture(bool testCapture) {
  // 仅创建并读取专用测试窗口，不枚举或读取其他应用
  WNDCLASSW fixtureClass{};
  fixtureClass.lpfnWndProc = DefWindowProcW;
  fixtureClass.hInstance = GetModuleHandleW(nullptr);
  fixtureClass.lpszClassName = L"DaedalusPerceptionFixture";
  fixtureClass.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
  RegisterClassW(&fixtureClass);
  auto hwnd = CreateWindowExW(
      0, fixtureClass.lpszClassName, L"Daedalus UIA fixture", WS_OVERLAPPEDWINDOW,
      40, 40, 640, 320, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
  if (!hwnd)
    throw std::runtime_error("computer_fixture_create_failed");
  CreateWindowExW(0, L"BUTTON", L"Fixture button", WS_CHILD | WS_VISIBLE, 20,
                  30, 200, 40, hwnd, nullptr, GetModuleHandleW(nullptr),
                  nullptr);
  CreateWindowExW(0, L"EDIT", L"fixture-password-never-read",
                  WS_CHILD | WS_VISIBLE | ES_PASSWORD, 20, 90, 240, 40, hwnd,
                  nullptr, GetModuleHandleW(nullptr), nullptr);
  ShowWindow(hwnd, SW_SHOWNOACTIVATE);
  UpdateWindow(hwnd);
  auto future = std::async(std::launch::async, [hwnd, testCapture] {
    const auto bounds = windowBounds(hwnd);
    auto result = readUia(hwnd, bounds);
    if (testCapture) {
      fprintf(stderr, "capture fixture: window_item\n");
      auto factory =
          winrt::get_activation_factory<GraphicsCaptureItem,
                                        IGraphicsCaptureItemInterop>();
      GraphicsCaptureItem item{nullptr};
      fprintf(stderr, "capture fixture: create_window_item\n");
      winrt::check_hresult(factory->CreateForWindow(
          hwnd, winrt::guid_of<GraphicsCaptureItem>(), winrt::put_abi(item)));
      const auto pixels = capture(item, true);
      if (pixels.width != bounds.right - bounds.left ||
          pixels.height != bounds.bottom - bounds.top)
        throw std::runtime_error(
            "computer_fixture_capture_coordinates_mismatch");
      fprintf(stderr, "capture fixture: encode_png\n");
      if (pngDataUrl(pixels).empty())
        throw std::runtime_error("computer_fixture_capture_empty");
    }
    return result;
  });
  while (future.wait_for(std::chrono::milliseconds(0)) !=
         std::future_status::ready) {
    MSG message;
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
      TranslateMessage(&message);
      DispatchMessageW(&message);
    }
    MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
  }
  try {
    auto result = future.get();
    bool button = false, password = false;
    for (auto value : result.nodes) {
      auto node = value.GetObject();
      button |= node.GetNamedString(L"name") == L"Fixture button";
      if (node.GetNamedBoolean(L"password")) {
        password = true;
        if (!node.GetNamedString(L"name").empty() ||
            !node.GetNamedString(L"automationId").empty())
          throw std::runtime_error("computer_fixture_password_leaked");
      }
    }
    if (!button || !password || result.passwords.empty() || result.truncated)
      throw std::runtime_error("computer_fixture_uia_failed");
  } catch (...) {
    DestroyWindow(hwnd);
    throw;
  }
  DestroyWindow(hwnd);
}
Json Perception::observe() {
  invalidateNodes(); uiaCache.reset();
  const unsigned epoch = nodeEpoch;
  if (!targetValid())
    throw std::runtime_error("computer_window_unavailable");
  auto started = std::chrono::steady_clock::now();
  HWND hwnd = selected->hwnd;
  RECT before = windowBounds(hwnd);
  UINT dpi = GetDpiForWindow(hwnd);
  GeometryGuard geometry(hwnd, selected->pid, before, dpi);
  // 与后续 UIA 操作共用长期 MTA 工作线程，不把 COM 节点留在短命 async 线程
  auto uia = readUia(hwnd, before);
  auto pixels = capture(life->item);
  auto capturedAt = nowIso();
  RECT after = windowBounds(hwnd);
  if (!targetValid() || !EqualRect(&before, &after) ||
      dpi != GetDpiForWindow(hwnd))
    throw std::runtime_error("computer_observation_stale");
  if (pixels.width != before.right - before.left ||
      pixels.height != before.bottom - before.top)
    throw std::runtime_error("computer_coordinate_mismatch");
  for (auto r : uia.passwords)
    for (int y = std::max(0L, r.top - before.top);
         y < std::min(static_cast<LONG>(pixels.height), r.bottom - before.top);
         ++y)
      for (int x = std::max(0L, r.left - before.left);
           x < std::min(static_cast<LONG>(pixels.width), r.right - before.left);
           ++x)
        for (int c = 0; c < 4; ++c)
          pixels.bgra[(y * pixels.width + x) * 4 + c] = c == 3 ? 255 : 0;
  if (std::max(pixels.width, pixels.height) > 2560) {
    double scale = 2560. / std::max(pixels.width, pixels.height);
    pixels = resizePixels(pixels,
                          std::max(1, static_cast<int>(pixels.width * scale)),
                          std::max(1, static_cast<int>(pixels.height * scale)));
  }
  std::string png;
  for (int i = 0; i < 24; ++i) {
    try {
      png = pngDataUrl(pixels);
      break;
    } catch (const std::runtime_error &) {
      pixels = resizePixels(pixels, std::max(1, pixels.width * 8 / 10),
                            std::max(1, pixels.height * 8 / 10));
    }
  }
  if (png.empty())
    throw std::runtime_error("computer_image_too_large");
  if (!ocr)
    ocr = std::make_unique<Ocr>(directory);
  bool truncated = uia.truncated;
  auto texts = ocr->recognize(pixels, truncated);
  size_t textBytes = 0;
  for (auto value : uia.nodes) {
    auto node = value.GetObject();
    for (auto key : {L"name", L"automationId", L"controlType"})
      textBytes += utf8(node.GetNamedString(key)).size();
  }
  Array boundedTexts;
  for (auto value : texts) {
    auto size = utf8(value.GetObject().GetNamedString(L"text")).size();
    if (textBytes + size > 65536) {
      truncated = true;
      break;
    }
    textBytes += size;
    boundedTexts.Append(value);
  }
  texts = boundedTexts;
  for (auto value : uia.nodes) {
    auto node = value.GetObject();
    auto r = node.GetNamedObject(L"bounds");
    double sx = double(pixels.width) / (before.right - before.left),
           sy = double(pixels.height) / (before.bottom - before.top);
    node.SetNamedValue(L"bounds",
                       rectJson((r.GetNamedNumber(L"x") - before.left) * sx,
                                (r.GetNamedNumber(L"y") - before.top) * sy,
                                r.GetNamedNumber(L"width") * sx,
                                r.GetNamedNumber(L"height") * sy));
  }
  if (!targetValid())
    throw std::runtime_error("computer_window_unavailable");
  after = windowBounds(hwnd);
  if (geometry.changed() || !EqualRect(&before, &after) ||
      dpi != GetDpiForWindow(hwnd))
    throw std::runtime_error("computer_observation_stale");
  Json result;
  const auto observationId = uuid();
  text(result, L"observationId", observationId);
  text(result, L"capturedAt", capturedAt);
  text(result, L"uiaCapturedAt", uia.at);
  result.SetNamedValue(L"screenBounds", rectJson(before.left, before.top,
                                                 before.right - before.left,
                                                 before.bottom - before.top));
  number(result, L"width", pixels.width);
  number(result, L"height", pixels.height);
  number(result, L"dpi", dpi);
  result.SetNamedValue(L"nodes", uia.nodes);
  result.SetNamedValue(L"texts", texts);
  jsonBoolean(result, L"truncated", truncated);
  number(result, L"durationMs",
         std::chrono::duration<double, std::milli>(
             std::chrono::steady_clock::now() - started)
             .count());
  text(result, L"dataUrl", png);
  if (nodeEpoch == epoch) uiaCache = std::make_shared<UiaCache>(UiaCache{std::move(uia), observationId, epoch});
  return result;
}

void Perception::performUia(const std::string &observationId, const Json &action, const std::function<void(POINT)> &validate) {
  auto cache = std::move(uiaCache);
  if (!cache || cache->epoch != nodeEpoch || cache->observationId != observationId || !targetValid())
    throw std::runtime_error("computer_observation_stale");
  const auto kind = action.GetNamedString(L"type");
  const auto id = utf8(action.GetNamedString(L"nodeId"));
  if (!cache->snapshot.entries.contains(id)) throw std::runtime_error("computer_uia_unsupported");
  auto &entry = cache->snapshot.entries.at(id);
  const bool hasValue = kind == L"uia_set_value", hasScroll = kind == L"uia_scroll", hasState = kind == L"uia_expand_collapse";
  if (action.Size() != (hasScroll ? 4u : hasValue || hasState ? 3u : 2u)) throw std::runtime_error("computer_invalid_request");
  if (hasValue && (!action.HasKey(L"value") || action.GetNamedString(L"value").size() > 4096)) throw std::runtime_error("computer_invalid_request");
  if (hasState && action.GetNamedString(L"state") != L"expanded" && action.GetNamedString(L"state") != L"collapsed") throw std::runtime_error("computer_invalid_request");
  auto supports = [&](const Array &actions) { for (auto v : actions) if (v.GetString() == kind) return true; return false; };
  if (!supports(entry.actions) || !supports(supportedActions(entry.element.get()))) throw std::runtime_error("computer_uia_unsupported");
  if (runtimeIdentity(entry.element.get()) != entry.runtimeId) throw std::runtime_error("computer_observation_stale");
  RECT current{}; winrt::check_hresult(entry.element->get_CurrentBoundingRectangle(&current));
  if (!EqualRect(&current, &entry.bounds)) throw std::runtime_error("computer_observation_stale");
  winrt::com_ptr<IUIAutomation> automation;
  winrt::check_hresult(CoCreateInstance(CLSID_CUIAutomation8, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(automation.put())));
  auto timeout = automation.as<IUIAutomation2>(); timeout->put_ConnectionTimeout(500); timeout->put_TransactionTimeout(1000);
  winrt::com_ptr<IUIAutomationElement> root; winrt::check_hresult(automation->ElementFromHandle(controlTarget(), root.put()));
  winrt::com_ptr<IUIAutomationTreeWalker> walker; winrt::check_hresult(automation->get_ControlViewWalker(walker.put()));
  auto ancestor = entry.element; bool belongs = false;
  for (int depth = 0; ancestor && depth <= 20; ++depth) {
    BOOL same = FALSE; winrt::check_hresult(automation->CompareElements(root.get(), ancestor.get(), &same));
    if (same) { belongs = true; break; }
    winrt::com_ptr<IUIAutomationElement> parent; walker->GetParentElement(ancestor.get(), parent.put()); ancestor = std::move(parent);
  }
  if (!belongs) throw std::runtime_error("computer_observation_stale");
  ScrollAmount amount = ScrollAmount_NoAmount;
  auto axis = hasScroll ? action.GetNamedString(L"axis") : L"vertical";
  if (hasScroll) {
    auto input = action.GetNamedString(L"amount");
    if (input == L"small_increment") amount = ScrollAmount_SmallIncrement;
    else if (input == L"small_decrement") amount = ScrollAmount_SmallDecrement;
    else if (input == L"large_increment") amount = ScrollAmount_LargeIncrement;
    else if (input == L"large_decrement") amount = ScrollAmount_LargeDecrement;
    if (amount == ScrollAmount_NoAmount || (axis != L"horizontal" && axis != L"vertical")) throw std::runtime_error("computer_invalid_request");
  }
  if (cache->epoch != nodeEpoch) throw std::runtime_error("computer_observation_stale");
  const auto beforeDispatch = [&] {
    if (cache->epoch != nodeEpoch) throw std::runtime_error("computer_observation_stale");
    validate({current.left + (current.right-current.left)/2, current.top + (current.bottom-current.top)/2});
  };
  // 方法返回失败也可能已经触发应用行为，不能自动重试或换输入通道
  HRESULT dispatched = E_FAIL;
  if (kind == L"uia_invoke") { auto p = pattern<IUIAutomationInvokePattern>(entry.element.get(), UIA_InvokePatternId); if (p) { beforeDispatch(); dispatched = p->Invoke(); } }
  else if (kind == L"uia_toggle") { auto p = pattern<IUIAutomationTogglePattern>(entry.element.get(), UIA_TogglePatternId); if (p) { beforeDispatch(); dispatched = p->Toggle(); } }
  else if (kind == L"uia_select") { auto p = pattern<IUIAutomationSelectionItemPattern>(entry.element.get(), UIA_SelectionItemPatternId); if (p) { beforeDispatch(); dispatched = p->Select(); } }
  else if (hasValue) {
    auto p = pattern<IUIAutomationValuePattern>(entry.element.get(), UIA_ValuePatternId);
    const auto value = action.GetNamedString(L"value");
    BSTR buffer = SysAllocStringLen(value.c_str(), value.size());
    if (!buffer) throw std::runtime_error("computer_native_failed");
    try { if (p) { beforeDispatch(); dispatched = p->SetValue(buffer); } }
    catch (...) { SecureZeroMemory(buffer, value.size() * sizeof(wchar_t)); SysFreeString(buffer); throw; }
    SecureZeroMemory(buffer, value.size() * sizeof(wchar_t)); SysFreeString(buffer);
  }
  else if (hasState) { auto p = pattern<IUIAutomationExpandCollapsePattern>(entry.element.get(), UIA_ExpandCollapsePatternId); if (p) { beforeDispatch(); dispatched = action.GetNamedString(L"state") == L"expanded" ? p->Expand() : p->Collapse(); } }
  else if (hasScroll) { auto p = pattern<IUIAutomationScrollPattern>(entry.element.get(), UIA_ScrollPatternId); if (p) { beforeDispatch(); dispatched = p->Scroll(axis == L"horizontal" ? amount : ScrollAmount_NoAmount, axis == L"vertical" ? amount : ScrollAmount_NoAmount); } }
  if (FAILED(dispatched) || cache->epoch != nodeEpoch) throw std::runtime_error("computer_action_unknown");
}

// 仅由 --test-input 调用，目标全部来自同进程专用窗口，不枚举真实应用
void testUiaActions(HWND target, HWND edit, HWND password, HWND checkbox) {
  Perception perception(0, L"");
  const auto pid = GetCurrentProcessId();
  perception.selected = std::make_unique<Target>(Target{target, pid, processStart(pid), "fixture", L"fixture"});
  perception.life = std::make_shared<Perception::WindowLife>();
  auto prepare = [&](HWND child, CONTROLTYPEID expectedType = 0) {
    perception.invalidateNodes();
    auto snapshot = readUia(target, windowBounds(target));
    std::string id;
    for (auto &[key, entry] : snapshot.entries) {
      UIA_HWND handle = nullptr;
      entry.element->get_CurrentNativeWindowHandle(&handle);
      if (expectedType == 0 && reinterpret_cast<HWND>(handle) == child) id = key;
      if (expectedType != 0) {
        CONTROLTYPEID type = 0; entry.element->get_CurrentControlType(&type);
        RECT container{}; GetWindowRect(child, &container);
        bool expandable = expectedType != UIA_TreeItemControlTypeId;
        for (auto operation : entry.actions) if (operation.GetString() == L"uia_expand_collapse") expandable = true;
        if (type == expectedType && entry.bounds.left >= container.left && entry.bounds.right <= container.right &&
            entry.bounds.top >= container.top && entry.bounds.bottom <= container.bottom && entry.actions.Size() && expandable) id = key;
      }
    }
    perception.uiaCache = std::make_shared<Perception::UiaCache>(Perception::UiaCache{std::move(snapshot), "fixture-uia", perception.nodeEpoch.load()});
    return id;
  };
  auto run = [&](Json action) {
    std::cerr << "UIA fixture: " << utf8(action.GetNamedString(L"type")) << " node=" << utf8(action.GetNamedString(L"nodeId")) << "\n";
    perception.performUia("fixture-uia", action, [&](POINT point) {
      if (GetAncestor(GetForegroundWindow(), GA_ROOT) != target || GetAncestor(WindowFromPoint(point), GA_ROOT) != target)
        throw std::runtime_error("computer_fixture_focus_failed");
    });
  };
  for (const std::string value : {"UIA fixture replacement", ""}) {
    auto id = prepare(edit); if (id.empty()) throw std::runtime_error("computer_fixture_uia_value_missing");
    Json action; text(action, L"type", "uia_set_value"); text(action, L"nodeId", id); text(action, L"value", value); run(action);
    wchar_t actual[100]{}; SendMessageW(edit, WM_GETTEXT, 100, reinterpret_cast<LPARAM>(actual));
    if (utf8(winrt::hstring(actual)) != value) throw std::runtime_error("computer_fixture_uia_value_failed");
    bool stale = false; try { run(action); } catch (...) { stale = true; }
    if (!stale) throw std::runtime_error("computer_fixture_uia_replayed");
  }
  auto id = prepare(checkbox);
  if (id.empty()) throw std::runtime_error("computer_fixture_uia_toggle_missing");
  Json toggle; text(toggle, L"type", "uia_toggle"); text(toggle, L"nodeId", id); run(toggle);
  if (SendMessageW(checkbox, BM_GETCHECK, 0, 0) != BST_CHECKED) throw std::runtime_error("computer_fixture_uia_toggle_failed");
  id = prepare(GetDlgItem(target, 101));
  Json invoke; text(invoke, L"type", "uia_invoke"); text(invoke, L"nodeId", id); run(invoke);
  wchar_t title[100]{};
  for (int attempt = 0; attempt < 100; ++attempt) {
    GetWindowTextW(target, title, 100);
    if (std::wstring(title) == L"UIA invoke completed") break;
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
  if (std::wstring(title) != L"UIA invoke completed") throw std::runtime_error("computer_fixture_uia_invoke_failed");
  HWND list = GetDlgItem(target, 103);
  id = prepare(list, UIA_ListItemControlTypeId);
  Json select; text(select, L"type", "uia_select"); text(select, L"nodeId", id); run(select);
  if (SendMessageW(list, LB_GETCURSEL, 0, 0) == LB_ERR) throw std::runtime_error("computer_fixture_uia_select_failed");
  SendMessageW(list, LB_SETTOPINDEX, 0, 0);
  id = prepare(list);
  Json scroll; text(scroll, L"type", "uia_scroll"); text(scroll, L"nodeId", id); text(scroll, L"axis", "vertical"); text(scroll, L"amount", "large_increment"); run(scroll);
  if (SendMessageW(list, LB_GETTOPINDEX, 0, 0) <= 0) throw std::runtime_error("computer_fixture_uia_scroll_failed");
  HWND tree = GetDlgItem(target, 104);
  for (const char *state : {"expanded", "collapsed"}) {
    id = prepare(tree, UIA_TreeItemControlTypeId);
    Json expand; text(expand, L"type", "uia_expand_collapse"); text(expand, L"nodeId", id); text(expand, L"state", state); run(expand);
    const bool expanded = (TreeView_GetItemState(tree, TreeView_GetRoot(tree), TVIS_EXPANDED) & TVIS_EXPANDED) != 0;
    if (expanded != (std::string(state) == "expanded")) throw std::runtime_error("computer_fixture_uia_expand_failed");
  }
  if (!prepare(password).empty()) throw std::runtime_error("computer_fixture_uia_password_exposed");
  id = prepare(edit);
  Json action; text(action, L"type", "uia_set_value"); text(action, L"nodeId", id); text(action, L"value", "must-not-write");
  SendMessageW(edit, EM_SETREADONLY, TRUE, 0);
  bool rejected = false; try { run(action); } catch (...) { rejected = true; }
  SendMessageW(edit, EM_SETREADONLY, FALSE, 0);
  if (!rejected) throw std::runtime_error("computer_fixture_uia_readonly_failed");
  id = prepare(edit); text(action, L"nodeId", id); perception.invalidateNodes();
  rejected = false; try { run(action); } catch (...) { rejected = true; }
  if (!rejected) throw std::runtime_error("computer_fixture_uia_revocation_failed");
  std::cout << "UIA invoke/toggle/select/set-value/scroll/expand, stale identity and readonly rejection passed\n";
}
