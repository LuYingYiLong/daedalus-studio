# Mascot

`NewSessionHome` 显示默认尺寸的空闲角色；会话中的 `HomeChatSurface` 将紧凑版角色绝对定位在底部 composer 区域右上方，不占用布局高度，消息队列出现时会随整个底部区域自动上移，鼠标事件穿透

吉祥物显示时，Virtuoso 的 Footer 增加 81px 末尾留白（73px 角色高度 + 8px 间距），增加可滚动内容高度，不缩小消息视口。滚到底部时最后一条消息能停在角色上方；浏览历史时保留悬浮覆盖效果。吉祥物隐藏时恢复普通末尾间距

- `idle`：蓝色行星绕行，主星呼吸、眨眼；窗口聚焦时视线跟随鼠标
- `thinking`：蓝色星环分前后两层环绕主星，左眼睁开、右眼眯成短横线；眼睛随呼吸轻微左右摆动，停止鼠标跟随
- `compact`：以 55% 比例显示，保留内部动画坐标
- `executing`：双眼专注睁开，主星轻微悬浮起伏，蓝色星环快速流动；目前通过预览指令展示，尚未接入工具执行事件
- `awaiting_approval`：双眼看向用户、缓慢呼吸与眨眼，星环放平并停止运动
- `sleeping`：空闲三分钟后进入休眠，双眼闭合，行星在主星旁缓慢摆动；鼠标、键盘或窗口重新活动时唤醒
- `disconnected`：Backend 连接断开时主星变暗，星环变为断续轨道，行星停滞在脱离位置；重连后恢复实时状态
- `completed`：主星以 CSS 3D 透视绕 Y 轴旋转两周（1.2s），球形轮廓保持体积，胶囊双眼随面部转动且背面隐藏，星环收拢成行星（0.9s），行星绕一圈归位（2.4s）；完成动作仅播放一次，结束后自动进入 idle；减少动态效果时直接进入 idle
- `failed`：主星缩小消失（0.65s），蓝色星环减速收回（1.6s），行星归位后弹出蓝色感叹号；失败提示保持显示，使用 `auto` 才恢复实时状态

在开发模式后端的会话输入框中发送：

```text
/test-mascot-status thinking
/test-mascot-status executing
/test-mascot-status awaiting_approval
/test-mascot-status completed
/test-mascot-status failed
/test-mascot-status sleeping
/test-mascot-status disconnected
/test-mascot-status idle
/test-mascot-status auto
```

省略参数默认预览 `thinking`。`auto` 清除当前会话的预览覆盖，恢复按 `isSending` 显示思考或空闲状态。预览仅保存在当前 renderer 内存中，按会话隔离，不写入会话事件；重载窗口后清除

系统启用减少动态效果时关闭循环动画与过渡，保留状态造型
