import { cloneDeep } from 'lodash';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import i18n from '@/../i18n/renderer';
import { getBilibiliAudioUrl } from '@/api/bilibili';
import { getLikedList, getMusicLrc, getMusicUrl, getParsingMusicUrl } from '@/api/music';
import { useMusicHistory } from '@/hooks/MusicHistoryHook';
import { audioService } from '@/services/audioService';
import type { ILyric, ILyricText, SongResult } from '@/type/music';
import { getImgUrl } from '@/utils';
import { getImageLinearBackground } from '@/utils/linearColor';
import { createDiscreteApi } from 'naive-ui';

import { useSettingsStore } from './settings';
import { useUserStore } from './user';

const musicHistory = useMusicHistory();
const { message } = createDiscreteApi(['message']);

const preloadingSounds = ref<Howl[]>([]);

function getLocalStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// 比较B站视频ID的辅助函数
export const isBilibiliIdMatch = (id1: string | number, id2: string | number): boolean => {
  const str1 = String(id1);
  const str2 = String(id2);
  
  // 如果两个ID都不包含--分隔符，直接比较
  if (!str1.includes('--') && !str2.includes('--')) {
    return str1 === str2;
  }
  
  // 处理B站视频ID
  if (str1.includes('--') || str2.includes('--')) {
    // 尝试从ID中提取bvid和cid
    const extractBvIdAndCid = (str: string) => {
      if (!str.includes('--')) return { bvid: '', cid: '' };
      const parts = str.split('--');
      if (parts.length >= 3) {
        // bvid--pid--cid格式
        return { bvid: parts[0], cid: parts[2] };
      } else if (parts.length === 2) {
        // 旧格式或其他格式
        return { bvid: '', cid: parts[1] };
      }
      return { bvid: '', cid: '' };
    };
    
    const { bvid: bvid1, cid: cid1 } = extractBvIdAndCid(str1);
    const { bvid: bvid2, cid: cid2 } = extractBvIdAndCid(str2);
    
    // 如果两个ID都有bvid，比较bvid和cid
    if (bvid1 && bvid2) {
      return bvid1 === bvid2 && cid1 === cid2;
    }
    
    // 其他情况，只比较cid部分
    if (cid1 && cid2) {
      return cid1 === cid2;
    }
  }
  
  // 默认情况，直接比较完整ID
  return str1 === str2;
};

// 提取公共函数：获取B站视频URL

export const getSongUrl = async (
  id: string | number,
  songData: SongResult,
  isDownloaded: boolean = false
) => {
  if (songData.playMusicUrl) {
    return songData.playMusicUrl;
  }

  if (songData.source === 'bilibili' && songData.bilibiliData) {
    console.log('加载B站音频URL');
    if (!songData.playMusicUrl && songData.bilibiliData.bvid && songData.bilibiliData.cid) {
      try {
        songData.playMusicUrl = await getBilibiliAudioUrl(
          songData.bilibiliData.bvid,
          songData.bilibiliData.cid
        );
        return songData.playMusicUrl;
      } catch (error) {
        console.error('重启后获取B站音频URL失败:', error);
        return '';
      }
    }
    return songData.playMusicUrl || '';
  }

  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
  const { data } = await getMusicUrl(numericId, isDownloaded);
  let url = '';
  let songDetail = null;
  try {
    if (data.data[0].freeTrialInfo || !data.data[0].url) {
      const res = await getParsingMusicUrl(numericId, cloneDeep(songData));
      url = res.data.data.url;
      songDetail = res.data.data;
    } else {
      songDetail = data.data[0] as any;
    }
  } catch (error) {
    console.error('error', error);
    url = data.data[0].url || '';
  }
  if (isDownloaded) {
    return songDetail;
  }
  url = url || data.data[0].url;
  return url;
};

const parseTime = (timeString: string): number => {
  const [minutes, seconds] = timeString.split(':');
  return Number(minutes) * 60 + Number(seconds);
};

const parseLyricLine = (lyricLine: string): { time: number; text: string } => {
  const TIME_REGEX = /(\d{2}:\d{2}(\.\d*)?)/g;
  const LRC_REGEX = /(\[(\d{2}):(\d{2})(\.(\d*))?\])/g;
  const timeText = lyricLine.match(TIME_REGEX)?.[0] || '';
  const time = parseTime(timeText);
  const text = lyricLine.replace(LRC_REGEX, '').trim();
  return { time, text };
};

const parseLyrics = (lyricsString: string): { lyrics: ILyricText[]; times: number[] } => {
  const lines = lyricsString.split('\n');
  const lyrics: ILyricText[] = [];
  const times: number[] = [];
  lines.forEach((line) => {
    const { time, text } = parseLyricLine(line);
    times.push(time);
    lyrics.push({ text, trText: '' });
  });
  return { lyrics, times };
};

export const loadLrc = async (id: string | number): Promise<ILyric> => {
  if (typeof id === 'string' && id.includes('--')) {
    console.log('B站音频，无需加载歌词');
    return {
      lrcTimeArray: [],
      lrcArray: []
    };
  }

  try {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    const { data } = await getMusicLrc(numericId);
    const { lyrics, times } = parseLyrics(data.lrc.lyric);
    const tlyric: Record<string, string> = {};

    if (data.tlyric && data.tlyric.lyric) {
      const { lyrics: tLyrics, times: tTimes } = parseLyrics(data.tlyric.lyric);
      tLyrics.forEach((lyric, index) => {
        tlyric[tTimes[index].toString()] = lyric.text;
      });
    }

    lyrics.forEach((item, index) => {
      item.trText = item.text ? tlyric[times[index].toString()] || '' : '';
    });
    return {
      lrcTimeArray: times,
      lrcArray: lyrics
    };
  } catch (err) {
    console.error('Error loading lyrics:', err);
    return {
      lrcTimeArray: [],
      lrcArray: []
    };
  }
};

const getSongDetail = async (playMusic: SongResult) => {
  playMusic.playLoading = true;

  if (playMusic.source === 'bilibili') {
    console.log('处理B站音频详情');
    const { backgroundColor, primaryColor } =
      playMusic.backgroundColor && playMusic.primaryColor
        ? playMusic
        : await getImageLinearBackground(getImgUrl(playMusic?.picUrl, '30y30'));

    playMusic.playLoading = false;
    return { ...playMusic, backgroundColor, primaryColor } as SongResult;
  }

  if (playMusic.expiredAt && playMusic.expiredAt < Date.now()) {
    console.info(`歌曲已过期，重新获取: ${playMusic.name}`);
    playMusic.playMusicUrl = undefined;
  }

  const playMusicUrl = playMusic.playMusicUrl || (await getSongUrl(playMusic.id, playMusic));
  playMusic.createdAt = Date.now();
  // 半小时后过期
  playMusic.expiredAt = playMusic.createdAt + 1800000;
  const { backgroundColor, primaryColor } =
    playMusic.backgroundColor && playMusic.primaryColor
      ? playMusic
      : await getImageLinearBackground(getImgUrl(playMusic?.picUrl, '30y30'));

  playMusic.playLoading = false;
  return { ...playMusic, playMusicUrl, backgroundColor, primaryColor } as SongResult;
};

const preloadNextSong = (nextSongUrl: string) => {
  try {
    // 清理多余的预加载实例，确保最多只有2个预加载音频
    while (preloadingSounds.value.length >= 2) {
      const oldestSound = preloadingSounds.value.shift();
      if (oldestSound) {
        try {
          oldestSound.stop();
          oldestSound.unload();
        } catch (e) {
          console.error('清理预加载音频实例失败:', e);
        }
      }
    }

    // 检查这个URL是否已经在预加载列表中
    const existingPreload = preloadingSounds.value.find(
      (sound) => (sound as any)._src === nextSongUrl
    );
    if (existingPreload) {
      console.log('该音频已在预加载列表中，跳过:', nextSongUrl);
      return existingPreload;
    }

    const sound = new Howl({
      src: [nextSongUrl],
      html5: true,
      preload: true,
      autoplay: false
    });

    preloadingSounds.value.push(sound);

    sound.on('loaderror', () => {
      console.error('预加载音频失败:', nextSongUrl);
      const index = preloadingSounds.value.indexOf(sound);
      if (index > -1) {
        preloadingSounds.value.splice(index, 1);
      }
      try {
        sound.stop();
        sound.unload();
      } catch (e) {
        console.error('卸载预加载音频失败:', e);
      }
    });

    return sound;
  } catch (error) {
    console.error('预加载音频出错:', error);
    return null;
  }
};

const fetchSongs = async (playList: SongResult[], startIndex: number, endIndex: number) => {
  try {
    const songs = playList.slice(Math.max(0, startIndex), Math.min(endIndex, playList.length));

    const detailedSongs = await Promise.all(
      songs.map(async (song: SongResult) => {
        try {
          if (!song.playMusicUrl || (song.source === 'netease' && !song.backgroundColor)) {
            return await getSongDetail(song);
          }
          return song;
        } catch (error) {
          console.error('获取歌曲详情失败:', error);
          return song;
        }
      })
    );

    const nextSong = detailedSongs[0];
    if (nextSong && !(nextSong.lyric && nextSong.lyric.lrcTimeArray.length > 0)) {
      try {
        nextSong.lyric = await loadLrc(nextSong.id);
      } catch (error) {
        console.error('加载歌词失败:', error);
      }
    }

    detailedSongs.forEach((song, index) => {
      if (song && startIndex + index < playList.length) {
        playList[startIndex + index] = song;
      }
    });

    if (nextSong && nextSong.playMusicUrl) {
      preloadNextSong(nextSong.playMusicUrl);
    }
  } catch (error) {
    console.error('获取歌曲列表失败:', error);
  }
};

const loadLrcAsync = async (playMusic: SongResult) => {
  if (playMusic.lyric && playMusic.lyric.lrcTimeArray.length > 0) {
    return;
  }
  const lyrics = await loadLrc(playMusic.id);
  playMusic.lyric = lyrics;
};

// 定时关闭类型
export enum SleepTimerType {
  NONE = 'none',         // 没有定时
  TIME = 'time',         // 按时间定时
  SONGS = 'songs',       // 按歌曲数定时
  PLAYLIST_END = 'end'   // 播放列表播放完毕定时
}

// 定时关闭信息
export interface SleepTimerInfo {
  type: SleepTimerType;
  value: number;         // 对于TIME类型，值以分钟为单位；对于SONGS类型，值为歌曲数量
  endTime?: number;      // 何时结束（仅TIME类型）
  startSongIndex?: number; // 开始时的歌曲索引（对于SONGS类型）
  remainingSongs?: number; // 剩余歌曲数（对于SONGS类型）
}

export const usePlayerStore = defineStore('player', () => {
  const play = ref(false);
  const isPlay = ref(false);
  const playMusic = ref<SongResult>(getLocalStorageItem('currentPlayMusic', {} as SongResult));
  const playMusicUrl = ref(getLocalStorageItem('currentPlayMusicUrl', ''));
  const playList = ref<SongResult[]>(getLocalStorageItem('playList', []));
  const playListIndex = ref(getLocalStorageItem('playListIndex', 0));
  const playMode = ref(getLocalStorageItem('playMode', 0));
  const musicFull = ref(false);
  const favoriteList = ref<Array<number | string>>(getLocalStorageItem('favoriteList', []));
  const savedPlayProgress = ref<number | undefined>();
  
  // 定时关闭相关状态
  const sleepTimer = ref<SleepTimerInfo>(getLocalStorageItem('sleepTimer', {
    type: SleepTimerType.NONE,
    value: 0
  }));
  
  const timerInterval = ref<number | null>(null);
  
  // 当前定时关闭状态
  const currentSleepTimer = computed(() => sleepTimer.value);
  
  // 判断是否有活跃的定时关闭
  const hasSleepTimerActive = computed(() => sleepTimer.value.type !== SleepTimerType.NONE);
  
  // 获取剩余时间（用于UI显示）
  const sleepTimerRemainingTime = computed(() => {
    if (sleepTimer.value.type === SleepTimerType.TIME && sleepTimer.value.endTime) {
      const remaining = Math.max(0, sleepTimer.value.endTime - Date.now());
      return Math.ceil(remaining / 60000); // 转换为分钟并向上取整
    }
    return 0;
  });
  
  // 获取剩余歌曲数（用于UI显示）
  const sleepTimerRemainingSongs = computed(() => {
    if (sleepTimer.value.type === SleepTimerType.SONGS) {
      return sleepTimer.value.remainingSongs || 0;
    }
    return 0;
  });
  
  const currentSong = computed(() => playMusic.value);
  const isPlaying = computed(() => isPlay.value);
  const currentPlayList = computed(() => playList.value);
  const currentPlayListIndex = computed(() => playListIndex.value);

  const handlePlayMusic = async (music: SongResult, isPlay: boolean = true) => {
    // 处理B站视频，确保URL有效
    if (music.source === 'bilibili' && music.bilibiliData) {
      try {
        console.log('处理B站视频，检查URL有效性');
        // 清除之前的URL，强制重新获取
        music.playMusicUrl = undefined;

        // 重新获取B站视频URL
        if (music.bilibiliData.bvid && music.bilibiliData.cid) {
          music.playMusicUrl = await getBilibiliAudioUrl(
            music.bilibiliData.bvid,
            music.bilibiliData.cid
          );
          console.log('获取B站URL成功:', music.playMusicUrl);
        }
      } catch (error) {
        console.error('获取B站音频URL失败:', error);
        message.error(i18n.global.t('player.playFailed'));
        return false; // 返回失败状态
      }
    }

    try {
      const updatedPlayMusic = await getSongDetail(music);
      playMusic.value = updatedPlayMusic;
      playMusicUrl.value = updatedPlayMusic.playMusicUrl as string;

      play.value = isPlay;

      localStorage.setItem('currentPlayMusic', JSON.stringify(playMusic.value));
      localStorage.setItem('currentPlayMusicUrl', playMusicUrl.value);
      localStorage.setItem('isPlaying', play.value.toString());

      let title = updatedPlayMusic.name;

      if (updatedPlayMusic.source === 'netease' && updatedPlayMusic?.song?.artists) {
        title += ` - ${updatedPlayMusic.song.artists.reduce(
          (prev: string, curr: any) => `${prev}${curr.name}/`,
          ''
        )}`;
      } else if (updatedPlayMusic.source === 'bilibili' && updatedPlayMusic?.song?.ar?.[0]) {
        title += ` - ${updatedPlayMusic.song.ar[0].name}`;
      }

      document.title = title;

      loadLrcAsync(playMusic.value);

      musicHistory.addMusic(playMusic.value);

      // 找到歌曲在播放列表中的索引，如果是通过 nextPlay/prevPlay 调用的，不会更新 playListIndex
      const songIndex = playList.value.findIndex(
        (item: SongResult) => item.id === music.id && item.source === music.source
      );
      
      // 只有在 songIndex 有效，并且与当前 playListIndex 不同时才更新
      // 这样可以避免与 nextPlay/prevPlay 中的索引更新冲突
      if (songIndex !== -1 && songIndex !== playListIndex.value) {
        console.log('歌曲索引不匹配，更新为:', songIndex);
        playListIndex.value = songIndex;
      }
      
      // 无论如何都预加载更多歌曲
      if (songIndex !== -1) {
        fetchSongs(playList.value, songIndex + 1, songIndex + 3);
      } else {
        console.warn('当前歌曲未在播放列表中找到');
      }
      
      // 使用标记防止循环调用
      let playInProgress = false;
      
      // 直接调用 playAudio 方法播放音频，不需要依赖外部监听
      try {
        if (playInProgress) {
          console.warn('播放操作正在进行中，避免重复调用');
          return true;
        }
        
        playInProgress = true;
        
        // 因为调用 playAudio 前我们已经设置了 play.value，所以不需要额外传递 shouldPlay 参数
        const result = await playAudio();
        
        playInProgress = false;
        return !!result;
      } catch (error) {
        console.error('自动播放音频失败:', error);
        playInProgress = false;
        return false;
      }
    } catch (error) {
      console.error('处理播放音乐失败:', error);
      message.error(i18n.global.t('player.playFailed'));
      return false;
    }
  };

  const setPlay = async (song: SongResult) => {
    try {
      // 直接调用 handlePlayMusic，它会处理索引更新和播放逻辑
      const success = await handlePlayMusic(song);
      
      // 记录到本地存储，保持一致性
      localStorage.setItem('currentPlayMusic', JSON.stringify(playMusic.value));
      localStorage.setItem('currentPlayMusicUrl', playMusicUrl.value);
      
      return success;
    } catch (error) {
      console.error('设置播放失败:', error);
      return false;
    }
  };

  const setIsPlay = (value: boolean) => {
    isPlay.value = value;
    play.value = value;
    localStorage.setItem('isPlaying', value.toString());
    // 通知主进程播放状态变化
    window.electron?.ipcRenderer.send('update-play-state', value);
  };

  const setPlayMusic = async (value: boolean | SongResult) => {
    if (typeof value === 'boolean') {
      setIsPlay(value);
    } else {
      await handlePlayMusic(value);
      play.value = true;
      isPlay.value = true;
      localStorage.setItem('currentPlayMusic', JSON.stringify(playMusic.value));
      localStorage.setItem('currentPlayMusicUrl', playMusicUrl.value);
    }
  };

  const setMusicFull = (value: boolean) => {
    musicFull.value = value;
  };

  const setPlayList = (list: SongResult[]) => {
    playListIndex.value = list.findIndex((item) => item.id === playMusic.value.id);
    playList.value = list;
    localStorage.setItem('playList', JSON.stringify(list));
    localStorage.setItem('playListIndex', playListIndex.value.toString());
  };

  const addToNextPlay = (song: SongResult) => {
    const list = [...playList.value];
    const currentIndex = playListIndex.value;

    const existingIndex = list.findIndex((item) => item.id === song.id);
    if (existingIndex !== -1) {
      list.splice(existingIndex, 1);
    }

    list.splice(currentIndex + 1, 0, song);
    setPlayList(list);
  };

  // 睡眠定时器功能
  const setSleepTimerByTime = (minutes: number) => {
    // 清除现有定时器
    clearSleepTimer();
    
    if (minutes <= 0) {
      return;
    }
    
    const endTime = Date.now() + minutes * 60 * 1000;
    
    sleepTimer.value = {
      type: SleepTimerType.TIME,
      value: minutes,
      endTime
    };
    
    // 保存到本地存储
    localStorage.setItem('sleepTimer', JSON.stringify(sleepTimer.value));
    
    // 设置定时器检查
    timerInterval.value = window.setInterval(() => {
      checkSleepTimer();
    }, 1000) as unknown as number; // 每秒检查一次
    
    console.log(`设置定时关闭: ${minutes}分钟后`);
    return true;
  };
  
  // 睡眠定时器功能
  const setSleepTimerBySongs = (songs: number) => {
    // 清除现有定时器
    clearSleepTimer();
    
    if (songs <= 0) {
      return;
    }
    
    sleepTimer.value = {
      type: SleepTimerType.SONGS,
      value: songs,
      startSongIndex: playListIndex.value,
      remainingSongs: songs
    };
    
    // 保存到本地存储
    localStorage.setItem('sleepTimer', JSON.stringify(sleepTimer.value));
    
    console.log(`设置定时关闭: 再播放${songs}首歌后`);
    return true;
  };
  
  // 睡眠定时器功能
  const setSleepTimerAtPlaylistEnd = () => {
    // 清除现有定时器
    clearSleepTimer();
    
    sleepTimer.value = {
      type: SleepTimerType.PLAYLIST_END,
      value: 0
    };
    
    // 保存到本地存储
    localStorage.setItem('sleepTimer', JSON.stringify(sleepTimer.value));
    
    console.log('设置定时关闭: 播放列表结束时');
    return true;
  };
  
  // 取消定时关闭
  const clearSleepTimer = () => {
    if (timerInterval.value) {
      window.clearInterval(timerInterval.value);
      timerInterval.value = null;
    }
    
    sleepTimer.value = {
      type: SleepTimerType.NONE,
      value: 0
    };
    
    // 保存到本地存储
    localStorage.setItem('sleepTimer', JSON.stringify(sleepTimer.value));
    
    console.log('取消定时关闭');
    return true;
  };
  
  // 检查定时关闭是否应该触发
  const checkSleepTimer = () => {
    if (sleepTimer.value.type === SleepTimerType.NONE) {
      return;
    }
    
    if (sleepTimer.value.type === SleepTimerType.TIME && sleepTimer.value.endTime) {
      if (Date.now() >= sleepTimer.value.endTime) {
        // 时间到，停止播放
        stopPlayback();
      }
    } else if (sleepTimer.value.type === SleepTimerType.PLAYLIST_END) {
      // 播放列表结束定时由nextPlay方法处理
    }
  };
  
  // 停止播放并清除定时器
  const stopPlayback = () => {
    console.log('定时器触发：停止播放');
    
    if (isPlaying.value) {
      setIsPlay(false);
      audioService.pause();
    }
    
    // 如果使用Electron，发送通知
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('show-notification', {
        title: i18n.global.t('player.sleepTimer.timerEnded'),
        body: i18n.global.t('player.sleepTimer.playbackStopped')
      });
    }
    
    // 清除定时器
    clearSleepTimer();
  };
  
  // 监听歌曲变化，处理按歌曲数定时和播放列表结束定时
  const handleSongChange = () => {
    console.log('歌曲已切换，检查定时器状态:', sleepTimer.value);
    
    // 处理按歌曲数定时
    if (sleepTimer.value.type === SleepTimerType.SONGS && sleepTimer.value.remainingSongs !== undefined) {
      sleepTimer.value.remainingSongs--;
      console.log(`剩余歌曲数: ${sleepTimer.value.remainingSongs}`);
      
      // 保存到本地存储
      localStorage.setItem('sleepTimer', JSON.stringify(sleepTimer.value));
      
      if (sleepTimer.value.remainingSongs <= 0) {
        // 歌曲数到达，停止播放
        console.log('已播放完设定的歌曲数，停止播放');
        stopPlayback()
        setTimeout(() => {
          stopPlayback();
        }, 1000);
      }
    }
    
    // 处理播放列表结束定时
    if (sleepTimer.value.type === SleepTimerType.PLAYLIST_END) {
      // 检查是否到达播放列表末尾
      const isLastSong = (playListIndex.value === playList.value.length - 1);
      
      // 如果是列表最后一首歌且不是循环模式，则设置为在这首歌结束后停止
      if (isLastSong && playMode.value !== 1) { // 1 是循环模式
        console.log('已到达播放列表末尾，将在当前歌曲结束后停止播放');
        // 转换为按歌曲数定时，剩余1首
        sleepTimer.value = {
          type: SleepTimerType.SONGS,
          value: 1,
          remainingSongs: 1
        };
        // 保存到本地存储
        localStorage.setItem('sleepTimer', JSON.stringify(sleepTimer.value));
      }
    }
  };

  // 修改nextPlay方法，加入定时关闭检查逻辑
  const nextPlay = async () => {
    // 静态标志，防止多次调用造成递归
    if ((nextPlay as any).isRunning) {
      console.log('下一首播放正在执行中，忽略重复调用');
      return;
    }
    
    try {
      (nextPlay as any).isRunning = true;
      
      if (playList.value.length === 0) {
        play.value = true;
        (nextPlay as any).isRunning = false;
        return;
      }

      // 检查是否是播放列表的最后一首且设置了播放列表结束定时
      if (playMode.value === 0 && playListIndex.value === playList.value.length - 1 && 
          sleepTimer.value.type === SleepTimerType.PLAYLIST_END) {
        // 已是最后一首且为顺序播放模式，触发停止
        stopPlayback();
        (nextPlay as any).isRunning = false;
        return;
      }

      // 在切换前保存当前播放状态
      const shouldPlayNext = play.value;
      console.log('切换到下一首，当前播放状态:', shouldPlayNext ? '播放' : '暂停');

      let nowPlayListIndex: number;

      if (playMode.value === 2) {
        do {
          nowPlayListIndex = Math.floor(Math.random() * playList.value.length);
        } while (nowPlayListIndex === playListIndex.value && playList.value.length > 1);
      } else {
        nowPlayListIndex = (playListIndex.value + 1) % playList.value.length;
      }

      // 重要：首先更新当前播放索引
      playListIndex.value = nowPlayListIndex;
      
      // 获取下一首歌曲
      const nextSong = playList.value[nowPlayListIndex];

      // 如果是B站视频，确保重新获取URL
      if (nextSong.source === 'bilibili' && nextSong.bilibiliData) {
        // 清除之前的URL，确保重新获取
        nextSong.playMusicUrl = undefined;
        console.log('下一首是B站视频，已清除URL强制重新获取');
      }

      // 尝试播放，并明确传递应该播放的状态
      const success = await handlePlayMusic(nextSong, shouldPlayNext);
      
      if (!success) {
        console.error('播放下一首失败，将从播放列表中移除此歌曲');
        // 从播放列表中移除失败的歌曲
        const newPlayList = [...playList.value];
        newPlayList.splice(nowPlayListIndex, 1);
        
        if (newPlayList.length > 0) {
          // 更新播放列表后，重新尝试播放下一首
          setPlayList(newPlayList);
          // 延迟一点时间再尝试下一首，避免立即触发可能导致的无限循环
          setTimeout(() => {
            (nextPlay as any).isRunning = false;
            nextPlay();
          }, 300);
          return;
        }
      }
      
      // 歌曲切换成功，触发歌曲变更处理（用于定时关闭功能）
      handleSongChange();
    } catch (error) {
      console.error('切换下一首出错:', error);
    } finally {
      (nextPlay as any).isRunning = false;
    }
  };

  const prevPlay = async () => {
    // 静态标志，防止多次调用造成递归
    if ((prevPlay as any).isRunning) {
      console.log('上一首播放正在执行中，忽略重复调用');
      return;
    }
    
    try {
      (prevPlay as any).isRunning = true;
      
      if (playList.value.length === 0) {
        play.value = true;
        (prevPlay as any).isRunning = false;
        return;
      }
      
      const nowPlayListIndex =
        (playListIndex.value - 1 + playList.value.length) % playList.value.length;

      // 重要：首先更新当前播放索引
      playListIndex.value = nowPlayListIndex;
        
      // 获取上一首歌曲
      const prevSong = playList.value[nowPlayListIndex];

      // 如果是B站视频，确保重新获取URL
      if (prevSong.source === 'bilibili' && prevSong.bilibiliData) {
        // 清除之前的URL，确保重新获取
        prevSong.playMusicUrl = undefined;
        console.log('上一首是B站视频，已清除URL强制重新获取');
      }

      // 尝试播放，如果失败会返回false
      const success = await handlePlayMusic(prevSong);
      
      if (success) {
        await fetchSongs(playList.value, playListIndex.value - 3, nowPlayListIndex);
      } else {
        console.error('播放上一首失败，将从播放列表中移除此歌曲');
        // 从播放列表中移除失败的歌曲
        const newPlayList = [...playList.value];
        newPlayList.splice(nowPlayListIndex, 1);
        
        if (newPlayList.length > 0) {
          // 更新播放列表后，重新尝试播放上一首
          setPlayList(newPlayList);
          // 延迟一点时间再尝试上一首，避免立即触发可能导致的无限循环
          setTimeout(() => {
            (prevPlay as any).isRunning = false;
            prevPlay();
          }, 300);
          return;
        }
      }
    } catch (error) {
      console.error('切换上一首出错:', error);
    } finally {
      (prevPlay as any).isRunning = false;
    }
  };

  const togglePlayMode = () => {
    playMode.value = (playMode.value + 1) % 3;
    localStorage.setItem('playMode', JSON.stringify(playMode.value));
  };

  const addToFavorite = async (id: number | string) => {
    // 检查是否已存在相同的ID或内容相同的B站视频
    const isAlreadyInList = favoriteList.value.some(existingId => 
      typeof id === 'string' && id.includes('--') 
        ? isBilibiliIdMatch(existingId, id)
        : existingId === id
    );
    
    if (!isAlreadyInList) {
      favoriteList.value.push(id);
      localStorage.setItem('favoriteList', JSON.stringify(favoriteList.value));
    }
  };

  const removeFromFavorite = async (id: number | string) => {
    // 对于B站视频，需要根据bvid和cid来匹配
    if (typeof id === 'string' && id.includes('--')) {
      favoriteList.value = favoriteList.value.filter(existingId => !isBilibiliIdMatch(existingId, id));
    } else {
      favoriteList.value = favoriteList.value.filter(existingId => existingId !== id);
    }
    localStorage.setItem('favoriteList', JSON.stringify(favoriteList.value));
  };

  const removeFromPlayList = (id: number | string) => {
    const index = playList.value.findIndex((item) => item.id === id);
    if (index === -1) return;

    // 如果删除的是当前播放的歌曲，先切换到下一首
    if (id === playMusic.value.id) {
      nextPlay();
    }

    // 从播放列表中移除，使用不可变的方式
    const newPlayList = [...playList.value];
    newPlayList.splice(index, 1);
    setPlayList(newPlayList);
  };

  // 初始化播放状态
  const initializePlayState = async () => {
    const settingStore = useSettingsStore();
    const savedPlayList = getLocalStorageItem('playList', []);
    const savedPlayMusic = getLocalStorageItem<SongResult | null>('currentPlayMusic', null);
    const savedProgress = localStorage.getItem('playProgress');

    if (savedPlayList.length > 0) {
      setPlayList(savedPlayList);
    }

    if (savedPlayMusic && Object.keys(savedPlayMusic).length > 0) {
      try {
        console.log('恢复上次播放的音乐:', savedPlayMusic.name);
        console.log('settingStore.setData', settingStore.setData);
        const isPlaying = settingStore.setData.autoPlay;

        // 如果是B站视频，确保播放URL能够在重启后正确恢复
        if (savedPlayMusic.source === 'bilibili' && savedPlayMusic.bilibiliData) {
          console.log('恢复B站视频播放', savedPlayMusic.bilibiliData);
          // 清除之前可能存在的播放URL，确保重新获取
          savedPlayMusic.playMusicUrl = undefined;
        }

        await handlePlayMusic({ ...savedPlayMusic, playMusicUrl: undefined }, isPlaying);

        if (savedProgress) {
          try {
            const progress = JSON.parse(savedProgress);
            if (progress && progress.songId === savedPlayMusic.id) {
              savedPlayProgress.value = progress.progress;
            } else {
              localStorage.removeItem('playProgress');
            }
          } catch (e) {
            console.error('解析保存的播放进度失败', e);
            localStorage.removeItem('playProgress');
          }
        }
      } catch (error) {
        console.error('重新获取音乐链接失败:', error);
        play.value = false;
        isPlay.value = false;
        playMusic.value = {} as SongResult;
        playMusicUrl.value = '';
        localStorage.removeItem('currentPlayMusic');
        localStorage.removeItem('currentPlayMusicUrl');
        localStorage.removeItem('isPlaying');
        localStorage.removeItem('playProgress');
      }
    }
  };

  const initializeFavoriteList = async () => {
    const userStore = useUserStore();
    const localFavoriteList = localStorage.getItem('favoriteList');
    const localList: number[] = localFavoriteList ? JSON.parse(localFavoriteList) : [];

    if (userStore.user && userStore.user.userId) {
      try {
        const res = await getLikedList(userStore.user.userId);
        if (res.data?.ids) {
          const serverList = res.data.ids.reverse();
          const mergedList = Array.from(new Set([...localList, ...serverList]));
          favoriteList.value = mergedList;
        } else {
          favoriteList.value = localList;
        }
      } catch (error) {
        console.error('获取服务器收藏列表失败，使用本地数据:', error);
        favoriteList.value = localList;
      }
    } else {
      favoriteList.value = localList;
    }

    localStorage.setItem('favoriteList', JSON.stringify(favoriteList.value));
  };

  // 修改：处理音频播放的方法，使用事件触发机制
  const playAudio = async () => {
    if (!playMusicUrl.value || !playMusic.value) return null;
    
    try {
      // 保存当前播放状态
      const shouldPlay = play.value;
      console.log('播放音频，当前播放状态:', shouldPlay ? '播放' : '暂停');

      // 检查是否有保存的进度
      let initialPosition = 0;
      const savedProgress = JSON.parse(localStorage.getItem('playProgress') || '{}');
      if (savedProgress.songId === playMusic.value.id) {
        initialPosition = savedProgress.progress;
      }

      // 对于B站视频，检查URL是否有效
      if (playMusic.value.source === 'bilibili' && (!playMusicUrl.value || playMusicUrl.value === 'undefined')) {
        console.log('B站视频URL无效，尝试重新获取');

        // 需要重新获取B站视频URL
        if (playMusic.value.bilibiliData) {
          try {
            const proxyUrl = await getBilibiliAudioUrl(
              playMusic.value.bilibiliData.bvid,
              playMusic.value.bilibiliData.cid
            );

            // 设置URL到播放器状态
            (playMusic.value as any).playMusicUrl = proxyUrl;
            playMusicUrl.value = proxyUrl;
          } catch (error) {
            console.error('获取B站音频URL失败:', error);
            message.error(i18n.global.t('player.playFailed'));
            return null;
          }
        }
      }

      // 播放新音频，传递是否应该播放的状态
      console.log('调用audioService.play，播放状态:', shouldPlay);
      const newSound = await audioService.play(playMusicUrl.value, playMusic.value, shouldPlay);

      // 如果有保存的进度，设置播放位置
      if (initialPosition > 0) {
        newSound.seek(initialPosition);
      }

      // 发布音频就绪事件，让 MusicHook.ts 来处理设置监听器
      window.dispatchEvent(new CustomEvent('audio-ready', { detail: { sound: newSound, shouldPlay } }));

      // 确保状态与 localStorage 同步
      localStorage.setItem('currentPlayMusic', JSON.stringify(playMusic.value));
      localStorage.setItem('currentPlayMusicUrl', playMusicUrl.value);
      
      return newSound;
    } catch (error) {
      console.error('播放音频失败:', error);
      setPlayMusic(false);
      
      // 避免直接调用 nextPlay，改用延时避免无限循环
      // 检查错误是否是由于操作锁引起的
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('操作锁激活')) {
        console.log('由于操作锁正在使用，将在500ms后重试');
        // 操作锁错误，延迟后再尝试
        setTimeout(() => {
          // 检查当前播放列表是否有下一首
          if (playList.value.length > 1) {
            nextPlay();
          }
        }, 500);
      } else {
        // 其他错误，延迟更短时间后切换
        setTimeout(() => {
          nextPlay();
        }, 100);
      }
      
      message.error(i18n.global.t('player.playFailed'));
      return null;
    }
  };

  return {
    play,
    isPlay,
    playMusic,
    playMusicUrl,
    playList,
    playListIndex,
    playMode,
    musicFull,
    savedPlayProgress,
    favoriteList,
    
    // 定时关闭相关
    sleepTimer,
    currentSleepTimer,
    hasSleepTimerActive,
    sleepTimerRemainingTime,
    sleepTimerRemainingSongs,
    setSleepTimerByTime,
    setSleepTimerBySongs,
    setSleepTimerAtPlaylistEnd,
    clearSleepTimer,

    currentSong,
    isPlaying,
    currentPlayList,
    currentPlayListIndex,

    setPlay,
    setIsPlay,
    nextPlay,
    prevPlay,
    setPlayMusic,
    setMusicFull,
    setPlayList,
    addToNextPlay,
    togglePlayMode,
    initializePlayState,
    initializeFavoriteList,
    addToFavorite,
    removeFromFavorite,
    removeFromPlayList,
    playAudio
  };
});
