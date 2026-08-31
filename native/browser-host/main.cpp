#include <windows.h>
#include <sddl.h>
#include <winrt/base.h>
#include <winrt/Windows.Data.Json.h>
#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
using winrt::Windows::Data::Json::JsonObject;
constexpr uint32_t maxFrame = 768 * 1024;
std::mutex outputMutex, peersMutex;
std::condition_variable peerAvailable;
struct Peer { HANDLE pipe; std::mutex write; explicit Peer(HANDLE h): pipe(h) {} ~Peer() { CloseHandle(pipe); } };
std::unordered_map<uint32_t, std::shared_ptr<Peer>> peers;
std::atomic<uint32_t> nextPeer{1};
// 双向命名管道必须使用重叠 I/O；同步句柄上的阻塞读取会阻塞反向写入
bool transfer(HANDLE h, void* data, DWORD size, DWORD& transferred, bool writing, bool overlapped) {
  OVERLAPPED operation{};
  if (overlapped) { operation.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr); if (!operation.hEvent) return false; }
  auto ok = writing ? WriteFile(h, data, size, &transferred, overlapped ? &operation : nullptr)
                    : ReadFile(h, data, size, &transferred, overlapped ? &operation : nullptr);
  if (!ok && overlapped && GetLastError() == ERROR_IO_PENDING) {
    if (writing && WaitForSingleObject(operation.hEvent, 5000) != WAIT_OBJECT_0) {
      CancelIoEx(h, &operation); GetOverlappedResult(h, &operation, &transferred, TRUE); ok = FALSE;
    } else ok = GetOverlappedResult(h, &operation, &transferred, TRUE);
  }
  if (operation.hEvent) CloseHandle(operation.hEvent);
  return ok != FALSE;
}
bool readAll(HANDLE h, void* data, uint32_t size, bool overlapped = false) {
  auto p = static_cast<char*>(data);
  while (size) { DWORD n{}; if (!transfer(h, p, size, n, false, overlapped) || !n) return false; p += n; size -= n; }
  return true;
}
bool writeAll(HANDLE h, const void* data, uint32_t size, bool overlapped = false) {
  auto p = static_cast<const char*>(data);
  while (size) { DWORD n{}; if (!transfer(h, const_cast<char*>(p), size, n, true, overlapped) || !n) return false; p += n; size -= n; }
  return true;
}
bool readFrame(HANDLE h, std::string& value, bool overlapped = false) {
  uint32_t size{};
  if (!readAll(h, &size, sizeof(size), overlapped) || size == 0 || size > maxFrame) return false;
  value.resize(size); return readAll(h, value.data(), size, overlapped);
}
bool writeFrame(HANDLE h, const std::string& value, bool overlapped = false) {
  if (value.empty() || value.size() > maxFrame) return false;
  auto size = static_cast<uint32_t>(value.size()); return writeAll(h, &size, sizeof(size), overlapped) && writeAll(h, value.data(), size, overlapped);
}
void output(const JsonObject& row) {
  std::lock_guard lock(outputMutex);
  if (!writeFrame(GetStdHandle(STD_OUTPUT_HANDLE), winrt::to_string(row.Stringify()))) ExitProcess(0);
}
std::wstring userSid() {
  HANDLE token{}; if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) throw 1;
  DWORD size{}; GetTokenInformation(token, TokenUser, nullptr, 0, &size);
  std::vector<char> buffer(size);
  auto ok = GetTokenInformation(token, TokenUser, buffer.data(), size, &size); CloseHandle(token);
  if (!ok) throw 1;
  LPWSTR sid{}; if (!ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(buffer.data())->User.Sid, &sid)) throw 1;
  std::wstring result(sid); LocalFree(sid); return result;
}
std::wstring pipeName() { return std::wstring(L"\\\\.\\pipe\\daedalus-browser-") + BROWSER_CHANNEL + L"-" + userSid(); }
void servePeer(uint32_t id, std::shared_ptr<Peer> peer) {
  winrt::init_apartment(winrt::apartment_type::multi_threaded);
  std::string frame;
  try {
    while (readFrame(peer->pipe, frame, true)) {
      JsonObject row; row.SetNamedValue(L"peer", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(id));
      row.SetNamedValue(L"packet", JsonObject::Parse(winrt::to_hstring(frame))); output(row);
    }
  } catch (...) { /* 无效消息只断开对应连接，不回显载荷 */ }
  { std::lock_guard lock(peersMutex); peers.erase(id); }
  peerAvailable.notify_one();
  JsonObject row; row.SetNamedValue(L"peer", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(id));
  row.SetNamedValue(L"closed", winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(true)); output(row);
}
HANDLE createPipe(bool first, SECURITY_ATTRIBUTES* sa) {
  return CreateNamedPipeW(pipeName().c_str(), PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | (first ? FILE_FLAG_FIRST_PIPE_INSTANCE : 0),
    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 8, maxFrame, maxFrame, 0, sa);
}
int broker() {
  PSECURITY_DESCRIPTOR descriptor{};
  auto acl = L"D:P(A;;GA;;;" + userSid() + L")";
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(acl.c_str(), SDDL_REVISION_1, &descriptor, nullptr)) return 2;
  SECURITY_ATTRIBUTES sa{sizeof(sa), descriptor, FALSE};
  HANDLE first = createPipe(true, &sa);
  if (first == INVALID_HANDLE_VALUE) { LocalFree(descriptor); return 3; }
  // EOF 与父进程退出直接终止整个转发进程，不等待阻塞中的浏览器或管道线程
  std::thread([] {
    winrt::init_apartment(winrt::apartment_type::multi_threaded); std::string frame;
    try {
      while (readFrame(GetStdHandle(STD_INPUT_HANDLE), frame)) {
        auto row = JsonObject::Parse(winrt::to_hstring(frame));
        auto number = row.GetNamedNumber(L"peer");
        if (number < 1 || number > UINT32_MAX || number != static_cast<uint32_t>(number)) break;
        std::shared_ptr<Peer> peer;
        { std::lock_guard lock(peersMutex); auto it = peers.find(static_cast<uint32_t>(number)); if (it != peers.end()) peer = it->second; }
        if (peer) { std::lock_guard lock(peer->write);
          if (row.GetNamedBoolean(L"close", false)) { CancelIoEx(peer->pipe, nullptr); DisconnectNamedPipe(peer->pipe); }
          else if (!writeFrame(peer->pipe, winrt::to_string(row.GetNamedObject(L"packet").Stringify()), true)) DisconnectNamedPipe(peer->pipe);
        }
      }
    } catch (...) {}
    ExitProcess(0);
  }).detach();
  JsonObject ready; ready.SetNamedValue(L"ready", winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(true)); output(ready);
  HANDLE pipe = first;
  while (true) {
    OVERLAPPED accept{}; accept.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!accept.hEvent) return 4;
    bool connected = ConnectNamedPipe(pipe, &accept) != FALSE;
    if (!connected) {
      auto error = GetLastError(); DWORD ignored{};
      connected = error == ERROR_PIPE_CONNECTED || (error == ERROR_IO_PENDING && GetOverlappedResult(pipe, &accept, &ignored, TRUE));
    }
    CloseHandle(accept.hEvent);
    if (connected) {
      auto peer = std::make_shared<Peer>(pipe); auto id = nextPeer++;
      { std::lock_guard lock(peersMutex); peers.emplace(id, peer); }
      std::thread(servePeer, id, peer).detach();
    } else CloseHandle(pipe);
    { std::unique_lock lock(peersMutex); peerAvailable.wait(lock, [] { return peers.size() < 7; }); }
    pipe = createPipe(false, &sa);
    if (pipe == INVALID_HANDLE_VALUE) { LocalFree(descriptor); return 4; }
  }
}
bool allowedOrigin(const std::wstring& origin) {
  return origin == (std::wstring(BROWSER_CHANNEL) == L"stable"
    ? L"chrome-extension://mmmfhlmnfnlknpghpmbimafedcpgpbfh/"
    : L"chrome-extension://nogbahgjfkhmeelmjgkgdefilhobconm/");
}
int nativeHost(const std::wstring& origin) {
  if (!allowedOrigin(origin)) return 5;
  auto pipe = CreateFileW(pipeName().c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION, nullptr);
  if (pipe == INVALID_HANDLE_VALUE) return 6;
  std::thread([pipe] { std::string frame; while (readFrame(pipe, frame, true) && writeFrame(GetStdHandle(STD_OUTPUT_HANDLE), frame)) {} ExitProcess(0); }).detach();
  std::string frame;
  while (readFrame(GetStdHandle(STD_INPUT_HANDLE), frame) && writeFrame(pipe, frame, true)) {}
  CloseHandle(pipe); return 0;
}
int wmain(int argc, wchar_t** argv) {
  try {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    if (argc == 2 && std::wstring(argv[1]) == L"--self-test") return allowedOrigin(L"chrome-extension://invalid/") || pipeName().find(userSid()) == std::wstring::npos ? 1 : 0;
    if (argc == 2 && std::wstring(argv[1]) == L"--broker") return broker();
    if (argc >= 2) return nativeHost(argv[1]);
  } catch (...) { return 7; }
  return 1;
}
