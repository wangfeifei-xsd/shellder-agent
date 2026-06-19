/** 与 agent-plant query_tool_config 种子 music_sing_v1 对齐的演示预制（Shellder 侧 baseUrl 由 HTTP 连接器承载） */
export const HTTP_QUERY_PRESET = {
  name: '唱歌',
  description: '根据歌曲名或歌手名，查询并播放数字人已录制的歌曲音频',
  toolCode: 'music_sing_v1',
  intentTags: ['music_sing', 'sing_song', '点歌', '唱歌', '唱一首', '来一首'],
  priority: 5,
  riskLevel: 'low' as const,
  needConfirmation: false,
  timeoutMs: 10000,
  parametersText: `[
  {
    "name": "song_name",
    "type": "string",
    "required": false,
    "description": "歌曲名称，支持模糊匹配"
  },
  {
    "name": "singer_name",
    "type": "string",
    "required": false,
    "description": "歌手或数字人名称"
  }
]`,
  invokeMethod: 'GET' as const,
  invokePath: '/api/example/music/search',
  invokeTimeoutMs: 5000,
  queryMappingText: `{
  "songName": "song_name",
  "singerName": "singer_name",
  "userId": "$context.userId"
}`,
  bodyMappingText: '',
  responseType: 'play_audio' as const,
  successPath: '$.code',
  successValue: '0',
  fieldMappingText: `{
  "audio_url": "$.data.audioUrl",
  "song_name": "$.data.songName",
  "duration": "$.data.duration",
  "reply_text": "$.data.replyText"
}`,
  replyTextPath: '$.data.replyText',
};
