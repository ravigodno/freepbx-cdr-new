-- Схема таблицы логов вызовов CDR для СУБД MariaDB / MySQL
-- Стандартная структура базы данных asteriskcdrdb, таблица cdr

CREATE DATABASE IF NOT EXISTS `asteriskcdrdb` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `asteriskcdrdb`;

CREATE TABLE IF NOT EXISTS `cdr` (
  `recid` int(11) NOT NULL AUTO_INCREMENT,
  `calldate` datetime NOT NULL DEFAULT '1000-01-01 00:00:00',
  `clid` varchar(80) NOT NULL DEFAULT '',
  `src` varchar(80) NOT NULL DEFAULT '',
  `dst` varchar(80) NOT NULL DEFAULT '',
  `dcontext` varchar(80) NOT NULL DEFAULT '',
  `channel` varchar(80) NOT NULL DEFAULT '',
  `dstchannel` varchar(80) NOT NULL DEFAULT '',
  `lastapp` varchar(80) NOT NULL DEFAULT '',
  `lastdata` varchar(80) NOT NULL DEFAULT '',
  `duration` int(11) NOT NULL DEFAULT 0,
  `billsec` int(11) NOT NULL DEFAULT 0,
  `disposition` varchar(45) NOT NULL DEFAULT '',
  `amaflags` int(11) NOT NULL DEFAULT 0,
  `accountcode` varchar(20) NOT NULL DEFAULT '',
  `uniqueid` varchar(150) NOT NULL DEFAULT '',
  `userfield` varchar(255) NOT NULL DEFAULT '',
  `did` varchar(50) NOT NULL DEFAULT '',
  `recordingfile` varchar(255) NOT NULL DEFAULT '',
  `cnum` varchar(40) NOT NULL DEFAULT '',
  `cnam` varchar(45) NOT NULL DEFAULT '',
  PRIMARY KEY (`recid`),
  KEY `calldate` (`calldate`),
  KEY `dst` (`dst`),
  KEY `src` (`src`),
  KEY `uniqueid` (`uniqueid`),
  KEY `disposition` (`disposition`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
