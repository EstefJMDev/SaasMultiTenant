from __future__ import annotations

import asyncio
from pathlib import Path
import tempfile
from typing import Protocol

import httpx

from app.core.config import settings


class VoiceClient(Protocol):
    @property
    def enabled(self) -> bool: ...

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        filename: str = "telegram-audio.ogg",
        content_type: str = "audio/ogg",
    ) -> str: ...

    async def synthesize_speech(self, text: str, speed_multiplier: float = 1.0) -> bytes: ...


class OpenAIVoiceClient:
    def __init__(self) -> None:
        self._api_key = (settings.openai_api_key or "").strip()
        self._base_url = settings.openai_base_url.rstrip("/")

    @property
    def enabled(self) -> bool:
        return bool(self._api_key)

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}"}

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        filename: str = "telegram-audio.ogg",
        content_type: str = "audio/ogg",
    ) -> str:
        if not self.enabled:
            raise RuntimeError("OpenAI API key is not configured")

        files = {"file": (filename, audio_bytes, content_type)}
        data = {"model": settings.telegram_stt_model}
        timeout = httpx.Timeout(timeout=max(settings.telegram_request_timeout_seconds, 60), connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self._base_url}/audio/transcriptions",
                headers=self._headers(),
                data=data,
                files=files,
            )
            response.raise_for_status()
            payload = response.json()
            text = str(payload.get("text") or "").strip()
            if not text:
                raise RuntimeError("Empty transcription")
            return text

    async def synthesize_speech(self, text: str, speed_multiplier: float = 1.0) -> bytes:
        if not self.enabled:
            raise RuntimeError("OpenAI API key is not configured")
        timeout = httpx.Timeout(timeout=max(settings.telegram_request_timeout_seconds, 60), connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self._base_url}/audio/speech",
                headers=self._headers(),
                json={
                    "model": settings.telegram_tts_model,
                    "voice": settings.telegram_tts_voice,
                    "input": text,
                    "format": settings.telegram_tts_format,
                    "speed": speed_multiplier,
                },
            )
            response.raise_for_status()
            return response.content


class LocalVoiceClient:
    def __init__(self) -> None:
        self._model = None

    @property
    def enabled(self) -> bool:
        return True

    def _get_whisper_model(self):
        if self._model is not None:
            return self._model
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except Exception as exc:
            raise RuntimeError("faster-whisper is not installed") from exc

        self._model = WhisperModel(
            settings.telegram_local_stt_model,
            device=settings.telegram_local_stt_device,
            compute_type=settings.telegram_local_stt_compute_type,
        )
        return self._model

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        filename: str = "telegram-audio.ogg",
        content_type: str = "audio/ogg",
    ) -> str:
        _ = content_type
        suffix = Path(filename).suffix or ".ogg"
        model = self._get_whisper_model()

        with tempfile.TemporaryDirectory(prefix="tg-voice-") as tmp_dir:
            src_path = Path(tmp_dir) / f"input{suffix}"
            src_path.write_bytes(audio_bytes)

            def _do_transcribe() -> str:
                segments, _info = model.transcribe(
                    str(src_path),
                    language=settings.telegram_local_stt_language,
                    beam_size=1,
                )
                return " ".join((seg.text or "").strip() for seg in segments).strip()

            text = await asyncio.to_thread(_do_transcribe)
            if not text:
                raise RuntimeError("Empty transcription")
            return text

    async def synthesize_speech(self, text: str, speed_multiplier: float = 1.0) -> bytes:
        engine = settings.telegram_local_tts_engine.strip().lower()
        try:
            return await self._synthesize_with_engine(engine, text, speed_multiplier)
        except Exception:
            fallback = settings.telegram_local_tts_fallback_engine.strip().lower()
            if fallback and fallback != engine:
                return await self._synthesize_with_engine(fallback, text, speed_multiplier)
            raise

    async def _synthesize_with_engine(
        self,
        engine: str,
        text: str,
        speed_multiplier: float,
    ) -> bytes:
        if engine == "piper":
            return await self._synthesize_with_piper(text, speed_multiplier)
        if engine == "edge":
            return await self._synthesize_with_edge(text, speed_multiplier)
        if engine == "gtts":
            return await self._synthesize_with_gtts(text, speed_multiplier)
        return await self._synthesize_with_espeak(text, speed_multiplier)

    async def _synthesize_with_piper(self, text: str, speed_multiplier: float) -> bytes:
        with tempfile.TemporaryDirectory(prefix="tg-tts-piper-") as tmp_dir:
            wav_path = Path(tmp_dir) / "reply.wav"
            out_path = Path(tmp_dir) / "reply.mp3"

            model_path = Path(settings.telegram_local_tts_piper_model_path)
            config_path = (
                Path(settings.telegram_local_tts_piper_config_path)
                if settings.telegram_local_tts_piper_config_path
                else None
            )
            if not model_path.exists():
                raise RuntimeError(f"Piper model not found: {model_path}")
            if config_path and not config_path.exists():
                raise RuntimeError(f"Piper config not found: {config_path}")

            length_scale = 1.0 / max(0.5, min(2.0, speed_multiplier))
            cmd = [
                settings.telegram_local_tts_piper_bin,
                "--model",
                str(model_path),
                "--output_file",
                str(wav_path),
                "--length_scale",
                f"{length_scale:.3f}",
            ]
            if config_path:
                cmd.extend(["--config", str(config_path)])
            if settings.telegram_local_tts_piper_speaker_id is not None:
                cmd.extend(["--speaker", str(settings.telegram_local_tts_piper_speaker_id)])

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _stdout, stderr = await proc.communicate(input=text.encode("utf-8"))
            if proc.returncode != 0:
                raise RuntimeError(f"piper failed: {stderr.decode(errors='ignore')}")

            await _ffmpeg_convert(wav_path, out_path)
            return out_path.read_bytes()

    async def _synthesize_with_edge(self, text: str, speed_multiplier: float) -> bytes:
        with tempfile.TemporaryDirectory(prefix="tg-tts-edge-") as tmp_dir:
            out_path = Path(tmp_dir) / "reply.mp3"
            try:
                import edge_tts  # type: ignore
            except Exception as exc:
                raise RuntimeError("edge-tts is not installed") from exc

            percent = int((speed_multiplier - 1.0) * 100)
            rate = f"{percent:+d}%"
            communicate = edge_tts.Communicate(
                text=text,
                voice=settings.telegram_local_tts_edge_voice,
                rate=rate,
            )
            await communicate.save(str(out_path))
            return out_path.read_bytes()

    async def _synthesize_with_gtts(self, text: str, speed_multiplier: float) -> bytes:
        with tempfile.TemporaryDirectory(prefix="tg-tts-gtts-") as tmp_dir:
            raw_path = Path(tmp_dir) / "raw.mp3"
            out_path = Path(tmp_dir) / "reply.mp3"
            try:
                from gtts import gTTS  # type: ignore
            except Exception as exc:
                raise RuntimeError("gTTS is not installed") from exc

            tts = gTTS(
                text=text,
                lang=settings.telegram_local_tts_gtts_lang,
                tld=settings.telegram_local_tts_gtts_tld,
                slow=False,
            )
            tts.save(str(raw_path))

            if abs(speed_multiplier - 1.0) < 0.01:
                return raw_path.read_bytes()
            await _ffmpeg_apply_speed(raw_path, out_path, speed_multiplier)
            return out_path.read_bytes()

    async def _synthesize_with_espeak(self, text: str, speed_multiplier: float) -> bytes:
        with tempfile.TemporaryDirectory(prefix="tg-tts-espeak-") as tmp_dir:
            wav_path = Path(tmp_dir) / "reply.wav"
            out_path = Path(tmp_dir) / "reply.mp3"

            speed = max(80, min(320, int(settings.telegram_local_tts_speed * speed_multiplier)))
            cmd = [
                "espeak",
                "-v",
                settings.telegram_local_tts_voice,
                "-s",
                str(speed),
                "-w",
                str(wav_path),
                text,
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                raise RuntimeError(f"espeak failed: {stderr.decode(errors='ignore')}")

            await _ffmpeg_convert(wav_path, out_path)
            return out_path.read_bytes()


async def _ffmpeg_convert(in_path: Path, out_path: Path) -> None:
    cmd = ["ffmpeg", "-y", "-i", str(in_path), str(out_path)]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {stderr.decode(errors='ignore')}")


def _build_atempo_chain(speed_multiplier: float) -> str:
    if speed_multiplier <= 0:
        return "atempo=1.0"

    remaining = speed_multiplier
    factors: list[float] = []
    while remaining > 2.0:
        factors.append(2.0)
        remaining /= 2.0
    while remaining < 0.5:
        factors.append(0.5)
        remaining /= 0.5
    factors.append(remaining)
    factors = [max(0.5, min(2.0, f)) for f in factors]
    return ",".join(f"atempo={f:.5f}" for f in factors)


async def _ffmpeg_apply_speed(in_path: Path, out_path: Path, speed_multiplier: float) -> None:
    chain = _build_atempo_chain(speed_multiplier)
    cmd = ["ffmpeg", "-y", "-i", str(in_path), "-filter:a", chain, str(out_path)]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg speed filter failed: {stderr.decode(errors='ignore')}")


def get_voice_client() -> VoiceClient:
    provider = settings.telegram_voice_provider.strip().lower()
    if provider == "openai":
        return OpenAIVoiceClient()
    return LocalVoiceClient()
