#include "perception.h"
#include <algorithm>
#include <cmath>
#include <filesystem>
#include <onnxruntime_cxx_api.h>
#include <queue>
#include <sstream>

struct Ocr::Impl {
  Ort::Env env{ORT_LOGGING_LEVEL_ERROR, "daedalus-ocr"};
  Ort::SessionOptions options;
  std::unique_ptr<Ort::Session> det, rec;
  std::vector<std::string> dictionary;
  Impl(const std::wstring &directory) {
    env.DisableTelemetryEvents();
    options.SetIntraOpNumThreads(2);
    options.SetInterOpNumThreads(1);
    options.SetExecutionMode(ExecutionMode::ORT_SEQUENTIAL);
    det = std::make_unique<Ort::Session>(
        env, (std::filesystem::path(directory) / L"det.onnx").c_str(), options);
    rec = std::make_unique<Ort::Session>(
        env, (std::filesystem::path(directory) / L"rec.onnx").c_str(), options);
    Ort::AllocatorWithDefaultOptions allocator;
    auto metadata = rec->GetModelMetadata();
    auto chars =
        metadata.LookupCustomMetadataMapAllocated("character", allocator);
    if (!chars)
      throw std::runtime_error("computer_ocr_dictionary_missing");
    dictionary.push_back("");
    std::istringstream lines(chars.get());
    std::string line;
    while (std::getline(lines, line)) {
      if (!line.empty() && line.back() == '\r')
        line.pop_back();
      dictionary.push_back(line);
    }
    dictionary.push_back(" ");
  }
  std::vector<Ort::Value> run(Ort::Session &session, const Pixels &image, int w,
                              int h) {
    auto input = normalizedPixels(image, w, h);
    std::array<int64_t, 4> shape{1, 3, h, w};
    auto memory =
        Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    auto tensor = Ort::Value::CreateTensor<float>(
        memory, input.data(), input.size(), shape.data(), shape.size());
    Ort::AllocatorWithDefaultOptions allocator;
    auto in = session.GetInputNameAllocated(0, allocator);
    auto out = session.GetOutputNameAllocated(0, allocator);
    const char *ins[] = {in.get()};
    const char *outs[] = {out.get()};
    Ort::RunOptions runOptions;
    return session.Run(runOptions, ins, &tensor, 1, outs, 1);
  }
};
Ocr::Ocr(const std::wstring &dir) : impl(std::make_unique<Impl>(dir)) {}
Ocr::~Ocr() = default;
Array Ocr::recognize(const Pixels &image, bool &truncated) {
  double scale = std::min(1., 1536. / std::max(image.width, image.height));
  int dw = std::max(32, static_cast<int>(std::round(image.width * scale / 32)) *
                            32),
      dh = std::max(
          32, static_cast<int>(std::round(image.height * scale / 32)) * 32);
  auto detection = impl->run(*impl->det, image, dw, dh);
  auto shape = detection[0].GetTensorTypeAndShapeInfo().GetShape();
  if (shape.size() != 4 || shape[0] != 1 || shape[1] != 1 || shape[2] <= 0 ||
      shape[3] <= 0 || shape[2] * shape[3] > 4000000)
    throw std::runtime_error("computer_ocr_output_invalid");
  int h = static_cast<int>(shape[2]), w = static_cast<int>(shape[3]);
  const float *scores = detection[0].GetTensorData<float>();
  std::vector<bool> seen(static_cast<size_t>(h) * w, false);
  struct Box {
    int x, y, w, h;
  };
  std::vector<Box> boxes;
  // UI 文字按检测连通区域分行，保留可验证的图片像素包围框，不推断交互控件
  for (int y = 0; y < h; ++y)
    for (int x = 0; x < w; ++x) {
      int index = y * w + x;
      if (seen[index] || scores[index] < .3f)
        continue;
      std::vector<int> queue{index};
      seen[index] = true;
      int x0 = x, x1 = x, y0 = y, y1 = y;
      double sum = 0;
      for (size_t i = 0; i < queue.size(); ++i) {
        int p = queue[i], px = p % w, py = p / w;
        sum += scores[p];
        x0 = std::min(x0, px);
        x1 = std::max(x1, px);
        y0 = std::min(y0, py);
        y1 = std::max(y1, py);
        for (auto [nx, ny] : std::array<std::pair<int, int>, 4>{
                 {{px - 1, py}, {px + 1, py}, {px, py - 1}, {px, py + 1}}}) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h)
            continue;
          int n = ny * w + nx;
          if (!seen[n] && scores[n] >= .3f) {
            seen[n] = true;
            queue.push_back(n);
          }
        }
      }
      if (queue.size() < 6 || sum / queue.size() < .6 || x1 - x0 < 2 ||
          y1 - y0 < 2)
        continue;
      double expand = double((x1 - x0 + 1) * (y1 - y0 + 1)) * 1.5 /
                      (2 * (x1 - x0 + y1 - y0 + 2));
      int bx = std::max(0, static_cast<int>((x0 - expand) * image.width / w)),
          by = std::max(0, static_cast<int>((y0 - expand) * image.height / h));
      int ex = std::min(image.width, static_cast<int>(std::ceil(
                                         (x1 + expand + 1) * image.width / w))),
          ey = std::min(image.height,
                        static_cast<int>(
                            std::ceil((y1 + expand + 1) * image.height / h)));
      if (boxes.size() < 500)
        boxes.push_back({bx, by, ex - bx, ey - by});
      else
        truncated = true;
    }
  std::sort(boxes.begin(), boxes.end(),
            [](auto a, auto b) { return a.y == b.y ? a.x < b.x : a.y < b.y; });
  Array result;
  size_t chars = 0;
  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(12);
  for (const auto &box : boxes) {
    if (std::chrono::steady_clock::now() > deadline) {
      truncated = true;
      break;
    }
    Pixels crop{
        box.w, box.h,
        std::vector<unsigned char>(static_cast<size_t>(box.w) * box.h * 4)};
    for (int row = 0; row < box.h; ++row)
      memcpy(crop.bgra.data() + row * box.w * 4,
             image.bgra.data() + ((row + box.y) * image.width + box.x) * 4,
             box.w * 4);
    int width =
        std::clamp(static_cast<int>(std::ceil(48. * box.w / box.h)), 16, 2048);
    auto recognition = impl->run(*impl->rec, crop, width, 48);
    auto dims = recognition[0].GetTensorTypeAndShapeInfo().GetShape();
    if (dims.size() != 3 || dims[0] != 1 || dims[1] <= 0 || dims[1] > 4096 ||
        dims[2] != static_cast<int64_t>(impl->dictionary.size()))
      throw std::runtime_error("computer_ocr_dictionary_mismatch");
    const float *probs = recognition[0].GetTensorData<float>();
    std::string value;
    double confidence = 0;
    int count = 0, previous = -1;
    for (int64_t t = 0; t < dims[1]; ++t) {
      const float *row = probs + t * dims[2];
      int index = static_cast<int>(std::max_element(row, row + dims[2]) - row);
      if (index && index != previous) {
        value += impl->dictionary[index];
        confidence += row[index];
        ++count;
      }
      previous = index;
    }
    if (!count || confidence / count < .5)
      continue;
    if (chars + value.size() > 65536) {
      truncated = true;
      break;
    }
    chars += value.size();
    Json block;
    text(block, L"id", std::to_string(result.Size()));
    text(block, L"text", value);
    number(block, L"confidence", confidence / count);
    block.SetNamedValue(L"bounds", rectJson(box.x, box.y, box.w, box.h));
    result.Append(block);
  }
  return result;
}
